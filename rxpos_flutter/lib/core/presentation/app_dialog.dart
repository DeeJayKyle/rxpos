// Dialogs that rise gently from the bottom and fade in (iOS), and settle back down when closed; still when the device
// asks for less motion. The same as Flutter's showDialog otherwise (the root navigator, the themes, the barrier).
import 'package:flutter/material.dart';

Future<T?> showAppDialog<T>({required BuildContext context, required WidgetBuilder builder, bool barrierDismissible = true}) {
  final nav = Navigator.of(context, rootNavigator: true);
  return nav.push<T>(_RiseDialogRoute<T>(
    context: context,
    builder: builder,
    barrierDismissible: barrierDismissible,
    barrierColor: DialogTheme.of(context).barrierColor ?? Colors.black54,
    themes: InheritedTheme.capture(from: context, to: nav.context),
  ));
}

class _RiseDialogRoute<T> extends DialogRoute<T> {
  _RiseDialogRoute({required super.context, required super.builder, super.barrierDismissible, super.barrierColor, super.themes});

  @override
  Duration get transitionDuration => const Duration(milliseconds: 240);

  @override
  Duration get reverseTransitionDuration => const Duration(milliseconds: 160);

  @override
  Widget buildTransitions(BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    return FadeTransition(
      opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut, reverseCurve: Curves.easeIn),
      child: SlideTransition(
        position: Tween(begin: const Offset(0, .06), end: Offset.zero)
            .animate(CurvedAnimation(parent: animation, curve: Curves.fastEaseInToSlowEaseOut, reverseCurve: Curves.easeInCubic)),
        child: child,
      ),
    );
  }
}
