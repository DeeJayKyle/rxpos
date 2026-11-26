package io.github.rxpos.printer;

import android.Manifest;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Set;
import java.util.UUID;

/**
 * RxPOS receipt printer (src/printer.js): ESC/POS bytes to a thermal printer, no print dialog.
 *   bluetooth: a printer paired in Android settings, over the serial port profile (SPP)
 *   usb:       a printer on the USB (OTG) port, through its bulk OUT endpoint
 *   network:   a network printer on its raw port (9100), over TCP
 * The cash drawer opens through the printer's drawer port: its kick command is part of the bytes.
 */
@CapacitorPlugin(name = "RxposPrinter", permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) })
public class RxposPrinterPlugin extends Plugin {

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String USB_PERMISSION = "io.github.rxpos.printer.USB_PERMISSION";
    private PluginCall usbWaiting;
    private BroadcastReceiver usbReceiver;

    private boolean needsBluetoothPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    @PluginMethod
    public void list(PluginCall call) {
        String kind = call.getString("kind", "bluetooth");
        if ("usb".equals(kind)) {
            call.resolve(withPrinters(usbPrinters()));
            return;
        }
        if (needsBluetoothPermission()) {
            requestPermissionForAlias("bluetooth", call, "bluetoothAllowed");
            return;
        }
        call.resolve(withPrinters(bluetoothPrinters()));
    }

    @PluginMethod
    public void print(PluginCall call) {
        String mode = call.getString("mode", "");
        if ("bluetooth".equals(mode) && needsBluetoothPermission()) {
            requestPermissionForAlias("bluetooth", call, "bluetoothAllowed");
            return;
        }
        if ("usb".equals(mode)) {
            UsbDevice dev = findUsb(call.getString("usb", ""));
            if (dev == null) {
                call.reject("No USB printer found: plug it in and switch it on");
                return;
            }
            UsbManager usb = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            if (!usb.hasPermission(dev)) {
                askUsb(call, usb, dev);
                return;
            }
        }
        send(call);
    }

    @PermissionCallback
    private void bluetoothAllowed(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) {
            call.reject("Allow RxPOS to use Nearby devices (Bluetooth) to print receipts");
            return;
        }
        if ("list".equals(call.getMethodName())) call.resolve(withPrinters(bluetoothPrinters()));
        else send(call);
    }

    private JSObject withPrinters(JSArray list) {
        JSObject r = new JSObject();
        r.put("printers", list);
        return r;
    }

    @SuppressWarnings("MissingPermission")
    private JSArray bluetoothPrinters() {
        JSArray out = new JSArray();
        BluetoothAdapter bt = adapter();
        if (bt == null || !bt.isEnabled()) return out;
        Set<BluetoothDevice> paired = bt.getBondedDevices();
        if (paired == null) return out;
        for (BluetoothDevice d : paired) {
            JSObject o = new JSObject();
            o.put("id", d.getAddress());
            o.put("name", d.getName() == null ? d.getAddress() : d.getName());
            BluetoothClass c = d.getBluetoothClass();
            // printers first in the app's list: an imaging device, or a name that says so
            o.put("likely", (c != null && c.getMajorDeviceClass() == BluetoothClass.Device.Major.IMAGING) || (d.getName() != null && d.getName().toLowerCase().matches(".*(print|pos|pt-|mpt|rpp|xp-|tm-).*")));
            out.put(o);
        }
        return out;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    private JSArray usbPrinters() {
        JSArray out = new JSArray();
        UsbManager usb = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (usb == null) return out;
        for (UsbDevice d : usb.getDeviceList().values()) {
            if (bulkOut(d) == null) continue;
            JSObject o = new JSObject();
            o.put("id", d.getVendorId() + ":" + d.getProductId());
            String name = Build.VERSION.SDK_INT >= 21 ? d.getProductName() : null;
            o.put("name", name == null ? "USB printer " + d.getVendorId() + ":" + d.getProductId() : name);
            out.put(o);
        }
        return out;
    }

    /** The printer named vendor:product, or the first USB device that looks like a printer */
    private UsbDevice findUsb(String id) {
        UsbManager usb = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (usb == null) return null;
        UsbDevice first = null;
        for (UsbDevice d : usb.getDeviceList().values()) {
            if (bulkOut(d) == null) continue;
            if ((d.getVendorId() + ":" + d.getProductId()).equals(id)) return d;
            if (first == null) first = d;
        }
        return first;
    }

    /** [interface, endpoint] for printing: the printer-class interface if there is one, else any bulk OUT endpoint */
    private Object[] bulkOut(UsbDevice d) {
        Object[] any = null;
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface itf = d.getInterface(i);
            for (int e = 0; e < itf.getEndpointCount(); e++) {
                UsbEndpoint ep = itf.getEndpoint(e);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                    if (itf.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return new Object[] { itf, ep };
                    if (any == null) any = new Object[] { itf, ep };
                }
            }
        }
        return any;
    }

    private void askUsb(PluginCall call, UsbManager usb, UsbDevice dev) {
        if (usbWaiting != null) usbWaiting.reject("Another print is waiting for USB permission");
        usbWaiting = call;
        call.setKeepAlive(true);
        if (usbReceiver == null) {
            usbReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    PluginCall waiting = usbWaiting;
                    usbWaiting = null;
                    if (waiting == null) return;
                    waiting.setKeepAlive(false);
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) send(waiting);
                    else waiting.reject("Allow RxPOS to use the USB printer to print receipts");
                }
            };
            ContextCompat.registerReceiver(getContext(), usbReceiver, new IntentFilter(USB_PERMISSION), ContextCompat.RECEIVER_NOT_EXPORTED);
        }
        Intent intent = new Intent(USB_PERMISSION).setPackage(getContext().getPackageName());
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        usb.requestPermission(dev, PendingIntent.getBroadcast(getContext(), 0, intent, flags));
    }

    /** Printing waits on the printer: never on the app's main thread */
    private void send(PluginCall call) {
        final String mode = call.getString("mode", "");
        final byte[] data;
        try {
            data = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Nothing to print");
            return;
        }
        if (data.length == 0 || data.length > 512 * 1024) {
            call.reject("Nothing to print");
            return;
        }
        new Thread(() -> {
            try {
                if ("network".equals(mode)) sendNetwork(call.getString("host", ""), call.getInt("port", 9100), data);
                else if ("bluetooth".equals(mode)) sendBluetooth(call.getString("address", ""), data);
                else if ("usb".equals(mode)) sendUsb(call.getString("usb", ""), data);
                else throw new Exception("Choose how this device reaches the printer");
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "The printer did not answer" : e.getMessage());
            }
        }).start();
    }

    private void sendNetwork(String host, int port, byte[] data) throws Exception {
        if (host == null || !host.matches("[A-Za-z0-9.-]{1,253}")) throw new Exception("The printer's address is not valid");
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 6000);
            s.setSoTimeout(6000);
            OutputStream out = s.getOutputStream();
            out.write(data);
            out.flush();
            Thread.sleep(200);
        } catch (java.io.IOException e) {
            throw new Exception("Can't reach the printer at " + host);
        }
    }

    @SuppressWarnings("MissingPermission")
    private void sendBluetooth(String address, byte[] data) throws Exception {
        BluetoothAdapter bt = adapter();
        if (bt == null) throw new Exception("This device has no Bluetooth");
        if (!bt.isEnabled()) throw new Exception("Turn Bluetooth on to print");
        if (!BluetoothAdapter.checkBluetoothAddress(address)) throw new Exception("Choose the Bluetooth printer again");
        BluetoothDevice dev = bt.getRemoteDevice(address);
        try {
            bt.cancelDiscovery();
        } catch (SecurityException ignored) {}
        BluetoothSocket sock = null;
        try {
            sock = dev.createRfcommSocketToServiceRecord(SPP);
            try {
                sock.connect();
            } catch (java.io.IOException first) {
                // some cheap printers only answer the insecure channel
                try { sock.close(); } catch (java.io.IOException ignored) {}
                sock = dev.createInsecureRfcommSocketToServiceRecord(SPP);
                sock.connect();
            }
            OutputStream out = sock.getOutputStream();
            out.write(data);
            out.flush();
            Thread.sleep(Math.min(3000, 300 + data.length / 10)); // let the printer take it all before the link closes
        } catch (java.io.IOException e) {
            throw new Exception("Can't reach the Bluetooth printer: is it on and paired?");
        } finally {
            if (sock != null) try { sock.close(); } catch (java.io.IOException ignored) {}
        }
    }

    private void sendUsb(String id, byte[] data) throws Exception {
        UsbManager usb = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        UsbDevice dev = findUsb(id);
        if (usb == null || dev == null) throw new Exception("No USB printer found: plug it in and switch it on");
        Object[] io = bulkOut(dev);
        UsbInterface itf = (UsbInterface) io[0];
        UsbEndpoint ep = (UsbEndpoint) io[1];
        UsbDeviceConnection c = usb.openDevice(dev);
        if (c == null) throw new Exception("Allow RxPOS to use the USB printer, then print again");
        try {
            if (!c.claimInterface(itf, true)) throw new Exception("The USB printer is busy");
            int chunk = Math.max(64, ep.getMaxPacketSize() * 64);
            for (int off = 0; off < data.length; off += chunk) {
                int n = Math.min(chunk, data.length - off);
                byte[] part = new byte[n];
                System.arraycopy(data, off, part, 0, n);
                if (c.bulkTransfer(ep, part, n, 5000) < 0) throw new Exception("The USB printer did not take the receipt");
            }
            c.releaseInterface(itf);
        } finally {
            c.close();
        }
    }
}
