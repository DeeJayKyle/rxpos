import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/app.dart';

void main() {
  testWidgets('the app starts on the sign-in screen', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: RxposApp()));
    await tester.pumpAndSettle();
    expect(find.text('Sign in'), findsOneWidget);
  });
}
