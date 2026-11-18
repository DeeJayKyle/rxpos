// Dialogs that rise gently from the bottom and fade in (iOS), and settle back down when closed; still when the device
// asks for less motion. The same as Flutter's showDialog otherwise (the root navigator, the themes, the barrier).
import 'package:flutter/material.dart';

/// side: a record's details (UI batch 3, C8): on a screen 1280 px or wider the dialog sits as a panel on the right,
/// the list beside it still in view behind a light barrier.
Future<T?> showAppDialog<T>({required BuildContext context, required WidgetBuilder builder, bool barrierDismissible = true, bool side = false}) {
  final nav = Navigator.of(context, rootNavigator: true);
  final size = MediaQuery.sizeOf(context);
  final wide = side && size.width >= 1280;
  // D8: phones: the pop-up rises from the bottom as a sheet across the screen, its buttons at the bottom edge
  final phone = size.width < 600;
  return nav.push<T>(_RiseDialogRoute<T>(
    context: context,
    builder: wide
        ? (c) {
            final t = Theme.of(c);
            return Theme(
              data: t.copyWith(dialogTheme: t.dialogTheme.copyWith(alignment: Alignment.centerRight, insetPadding: const EdgeInsets.fromLTRB(0, 16, 16, 16))),
              child: KeyedSubtree(key: const Key('side-panel'), child: builder(c)),
            );
          }
        : phone
            ? (c) {
                final t = Theme.of(c);
                return Theme(
                  data: t.copyWith(dialogTheme: t.dialogTheme.copyWith(
                    alignment: Alignment.bottomCenter,
                    insetPadding: EdgeInsets.only(top: MediaQuery.paddingOf(c).top + 8),
                    constraints: BoxConstraints(minWidth: size.width, maxWidth: size.width),
                    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
                  )),
                  child: KeyedSubtree(key: const Key('phone-sheet'), child: builder(c)),
                );
              }
            : builder,
    barrierDismissible: barrierDismissible,
    barrierColor: wide ? Colors.black12 : DialogTheme.of(context).barrierColor ?? Colors.black54,
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
