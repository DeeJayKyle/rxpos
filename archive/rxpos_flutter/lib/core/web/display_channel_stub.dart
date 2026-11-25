// Not a browser: there is no second window to talk to; the customer display reads the till's sale in this app.
bool get displayChannelAvailable => false;
void displaySend(Map<String, Object?> msg) {}
void Function() displayListen(void Function(Map<String, Object?> msg) on) => () {};
void openDisplayWindow() {}
