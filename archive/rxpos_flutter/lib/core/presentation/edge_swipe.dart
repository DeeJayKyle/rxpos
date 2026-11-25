// Swipe from the left edge of the screen to go back (iOS): the page follows the finger.
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

/// Swipe from the left edge of the screen (a finger, starting within [edge] px) to the right to go back: the page
/// follows the finger, then carries on sliding away (or springs back when let go early). Only from the very edge, so
/// lists, tables, charts and chips that scroll sideways keep their own swipes.
class EdgeSwipeBack extends StatefulWidget {
  const EdgeSwipeBack({super.key, required this.enabled, required this.onBack, required this.child, this.edge = 24});
  final bool enabled;
  final double edge;

  /// go back; [from] is how far (0..1 of the width) the page was pulled. False: nowhere to go.
  final bool Function(double from) onBack;
  final Widget child;

  @override
  State<EdgeSwipeBack> createState() => _EdgeSwipeBackState();
}

class _EdgeSwipeBackState extends State<EdgeSwipeBack> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 220))..addListener(() => setState(() {}));
  double _width = 1;
  bool _rtl = false;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _update(DragUpdateDetails d) {
    _c.stop();
    final dx = (_rtl ? -d.primaryDelta! : d.primaryDelta!) / _width;
    _c.value = (_c.value + dx).clamp(0, 1);
  }

  void _end(DragEndDetails d) {
    final v = (_rtl ? -1 : 1) * (d.primaryVelocity ?? 0);
    final f = _c.value;
    if ((f > .33 || (v > 450 && f > .04)) && widget.onBack(f)) {
      _c.value = 0; // the page change carries on from where the finger let go (GlideTransition)
      return;
    }
    _settleBack();
  }

  void _settleBack() {
    if (!mounted || _c.value == 0) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = 0;
    } else {
      _c.animateTo(0, curve: Curves.easeOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) {
    _rtl = Directionality.of(context) == TextDirection.rtl;
    final f = _c.value;
    final shade = Theme.of(context).brightness == Brightness.dark ? Colors.black : const Color(0xFF0F172A);
    return LayoutBuilder(builder: (context, box) {
      _width = box.maxWidth.isFinite && box.maxWidth > 0 ? box.maxWidth : 1;
      return RawGestureDetector(
        behavior: HitTestBehavior.translucent,
        gestures: {
          if (widget.enabled)
            _EdgeDrag: GestureRecognizerFactoryWithHandlers<_EdgeDrag>(
              () => _EdgeDrag(debugOwner: this),
              (r) => r
                ..edge = widget.edge
                ..rtl = _rtl
                ..width = _width
                ..onUpdate = _update
                ..onEnd = _end
                ..onCancel = _settleBack,
            ),
        },
        child: Stack(fit: StackFit.passthrough, children: [
          FractionalTranslation(translation: Offset(_rtl ? -f : f, 0), child: widget.child),
          // a soft shadow along the edge of the page being pulled away
          if (f > 0)
            Positioned(
              top: 0,
              bottom: 0,
              left: _rtl ? null : f * _width - 14,
              right: _rtl ? f * _width - 14 : null,
              width: 14,
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: _rtl ? Alignment.centerRight : Alignment.centerLeft,
                      end: _rtl ? Alignment.centerLeft : Alignment.centerRight,
                      colors: [shade.withValues(alpha: 0), shade.withValues(alpha: .12 * (1 - f))],
                    ),
                  ),
                ),
              ),
            ),
        ]),
      );
    });
  }
}

/// A sideways drag that only starts at the screen's leading edge, with a finger or a pen, and wins over the page's
/// own sideways scrolling there (it takes a shorter move to start).
class _EdgeDrag extends HorizontalDragGestureRecognizer {
  _EdgeDrag({super.debugOwner}) : super(supportedDevices: const {PointerDeviceKind.touch, PointerDeviceKind.stylus});
  double edge = 24, width = 1;
  bool rtl = false;

  @override
  DeviceGestureSettings? get gestureSettings => const DeviceGestureSettings(touchSlop: 8);
  @override
  set gestureSettings(DeviceGestureSettings? _) {}

  @override
  bool isPointerAllowed(PointerEvent event) {
    final x = event.localPosition.dx;
    return (rtl ? x >= width - edge : x <= edge) && super.isPointerAllowed(event);
  }
}
