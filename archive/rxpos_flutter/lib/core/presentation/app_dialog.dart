// Dialogs that rise gently from the bottom and fade in (iOS), and settle back down when closed; still when the device
// asks for less motion. The same as Flutter's showDialog otherwise (the root navigator, the themes, the barrier).
import 'package:flutter/material.dart';

import '../theme/behaviour.dart' show sheetsOn;

/// side: a record's details (UI batch 3, C8): on a screen 1280 px or wider the dialog sits as a panel on the right,
/// the list beside it still in view behind a light barrier.
Future<T?> showAppDialog<T>({required BuildContext context, required WidgetBuilder builder, bool barrierDismissible = true, bool side = false}) {
  final nav = Navigator.of(context, rootNavigator: true);
  final size = MediaQuery.sizeOf(context);
  final wide = side && size.width >= 1280;
  // D8: phones: the pop-up rises from the bottom as a sheet across the screen, its buttons at the bottom edge
  // 1.18.0 Sheets & gestures (Control Centre): on any screen the pop-up rises as a sheet with a grab handle; drag it down to close
  final sheet = sheetsOn.value && !wide;
  final phone = size.width < 600 || sheet;
  final sheetW = sheet && size.width >= 600 ? (size.width < 760 ? size.width : 720.0) : size.width;
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
                    constraints: BoxConstraints(minWidth: sheetW, maxWidth: sheetW),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(sheet ? 22 : 16))),
                  )),
                  child: KeyedSubtree(key: const Key('phone-sheet'), child: sheet ? _DragToClose(child: builder(c)) : builder(c)),
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

/// 1.18.0: a sheet's grab handle above it; dragging down past 120 dp (or a quick flick) closes it, else it springs back
class _DragToClose extends StatefulWidget {
  const _DragToClose({required this.child});
  final Widget child;
  @override
  State<_DragToClose> createState() => _DragToCloseState();
}

class _DragToCloseState extends State<_DragToClose> {
  double _dy = 0;
  @override
  Widget build(BuildContext context) {
    void end(DragEndDetails d) {
      if (_dy > 120 || (d.primaryVelocity ?? 0) > 700) {
        Navigator.of(context).maybePop();
      } else {
        setState(() => _dy = 0);
      }
    }

    // a small grip at the top centre (the rest of the sheet's top stays the sheet's own)
    final handle = Center(
      child: GestureDetector(
        key: const Key('sheet-grab'),
        behavior: HitTestBehavior.opaque,
        onVerticalDragUpdate: (d) => setState(() => _dy = (_dy + d.delta.dy).clamp(0, 2000)),
        onVerticalDragEnd: end,
        child: Semantics(
          label: 'Drag down to close',
          child: SizedBox(
            width: 120,
            height: 22,
            child: Center(child: Container(width: 44, height: 5, decoration: BoxDecoration(color: Theme.of(context).dividerColor, borderRadius: BorderRadius.circular(3)))),
          ),
        ),
      ),
    );
    return AnimatedContainer(
      duration: _dy == 0 ? const Duration(milliseconds: 220) : Duration.zero,
      curve: Curves.easeOutBack,
      transform: Matrix4.translationValues(0, _dy, 0),
      child: Stack(children: [widget.child, Positioned(top: 0, left: 0, right: 0, child: handle)]),
    );
  }
}
