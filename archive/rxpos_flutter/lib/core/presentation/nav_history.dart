// Where the pages have been in this session, for the Back button, Android's back button, the edge swipe and Alt+← / →
// (screens move with context.go, which keeps no history), and how the next page change moves: pushed in from the
// right, going back the other way, or a cross-fade between the bottom tabs.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The pages' navigator inside the app's frame (menus and sheets opened from a page sit on it).
final shellNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'pages');

/// How a page change looks.
enum NavMotion {
  /// a new page slides in from the right, the old one drifts left (iOS push)
  push,

  /// the page you leave slides off to the right, the earlier one comes back from the left
  back,

  /// the bottom tabs: a quick cross-fade
  fade,
}

class NavHistory extends ChangeNotifier {
  final List<String> _stack = [];
  int _at = -1;
  int? _stepTo;
  NavMotion? _next;
  double _nextFrom = 0;

  /// how the latest page change moves
  NavMotion motion = NavMotion.push;

  /// where an edge swipe let go of the page (0..1 of the width): going back carries on from there
  double from = 0;

  List<String> get stack => List.unmodifiable(_stack);
  String? get current => _at >= 0 ? _stack[_at] : null;
  /// An earlier page of this session to step back to (Alt+←).
  bool get canStepBack => _at > 0;
  bool get canForward => _at >= 0 && _at < _stack.length - 1;

  /// The router moved to [location] (path and query).
  void visited(String location) {
    if (location.isEmpty) return;
    if (location.startsWith('/sign-in')) {
      _stack.clear();
      _at = -1;
      _stepTo = null;
      _next = null;
      return;
    }
    final step = _stepTo;
    _stepTo = null;
    if (step != null && step >= 0 && step < _stack.length && _stack[step] == location) {
      _at = step;
    } else if (_at < 0 || _stack[_at] != location) {
      if (_at >= 0) _stack.removeRange(_at + 1, _stack.length);
      _stack.add(location);
      if (_stack.length > 60) _stack.removeAt(0);
      _at = _stack.length - 1;
    } else {
      return; // the same place (the router rebuilt)
    }
    motion = _next ?? NavMotion.push;
    from = _nextFrom;
    _next = null;
    _nextFrom = 0;
    notifyListeners();
  }

  /// Go to [location] with [how] (a bottom tab: [NavMotion.fade]).
  void go(GoRouter router, String location, {NavMotion how = NavMotion.push}) {
    _next = how;
    router.go(location);
  }

  /// Back to the previous page of this session; with none, to the dashboard. [from]: where an edge swipe let go.
  /// False when there is nowhere to go (on the dashboard with no earlier page).
  bool back(GoRouter router, {double from = 0}) {
    final here = router.routerDelegate.currentConfiguration.uri.toString();
    if (_at > 0) {
      _stepTo = _at - 1;
    } else if (Uri.parse(here).path != '/') {
      // opened straight on this page: the dashboard comes before it
      if (_at < 0) {
        _stack
          ..clear()
          ..add(here);
        _at = 0;
      }
      _stack.insert(0, '/');
      _at++;
      _stepTo = 0;
    } else {
      return false;
    }
    _next = NavMotion.back;
    _nextFrom = from.clamp(0, .95);
    router.go(_stack[_stepTo!]);
    return true;
  }

  /// Forward again after going back (Alt+→).
  bool forward(GoRouter router) {
    if (!canForward) return false;
    _stepTo = _at + 1;
    _next = NavMotion.push;
    router.go(_stack[_stepTo!]);
    return true;
  }
}

/// The session's page history (kept while the app runs).
final navHistoryProvider = Provider<NavHistory>((ref) {
  final h = NavHistory();
  ref.onDispose(h.dispose);
  return h;
});

/// How long a page change takes: short and gliding; none when the device asks for less motion.
/// Short: the new page is usable at once, the motion only eases it in (as the web app: src/mobilenav.jsx)
Duration navDuration(NavMotion how) => switch (how) {
      NavMotion.fade => const Duration(milliseconds: 140),
      _ => const Duration(milliseconds: 220),
    };

/// A page's way in and out: iOS push (the new page from the right, the old one drifting left), back the other way
/// (carrying on from where an edge swipe let go), and a cross-fade between the bottom tabs. Each page is clipped to
/// where the other is not, so see-through designs never show two pages on top of each other.
class GlideTransition extends StatelessWidget {
  const GlideTransition({super.key, required this.primary, required this.secondary, required this.history, required this.child});
  final Animation<double> primary, secondary;
  final NavHistory history;
  final Widget child;

  static const _curve = Curves.fastEaseInToSlowEaseOut;
  static const _parallax = .3;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final sign = rtl ? -1.0 : 1.0;
    return AnimatedBuilder(
      animation: Listenable.merge([primary, secondary]),
      child: child,
      builder: (context, child) {
        var w = child!;
        final how = history.motion;
        final p = primary.value, s = secondary.value;
        // coming in
        if (p < 1) {
          switch (how) {
            case NavMotion.push:
              final x = 1 - _curve.transform(p);
              w = FractionalTranslation(translation: Offset(sign * x, 0), child: w);
            case NavMotion.back:
              final q = history.from + (1 - history.from) * _curve.transform(p);
              w = FractionalTranslation(
                translation: Offset(sign * -_parallax * (1 - q), 0),
                child: ClipRect(clipper: _Band(start: 0, end: q + _parallax * (1 - q), rtl: rtl), child: w),
              );
            case NavMotion.fade:
              w = Opacity(opacity: Curves.easeOut.transform(p), child: w);
          }
        }
        // going out under the next page
        if (s > 0) {
          switch (how) {
            case NavMotion.push:
              final c = _curve.transform(s);
              w = FractionalTranslation(
                translation: Offset(sign * -_parallax * c, 0),
                child: ClipRect(clipper: _Band(start: _parallax * c, end: 1 - c + _parallax * c, rtl: rtl), child: w),
              );
            case NavMotion.back:
              final q = history.from + (1 - history.from) * _curve.transform(s);
              w = FractionalTranslation(translation: Offset(sign * q, 0), child: w);
            case NavMotion.fade:
              w = Opacity(opacity: 1 - Curves.easeIn.transform(s), child: w);
          }
        }
        return w;
      },
    );
  }
}

/// Keeps the part of a page between [start] and [end] (fractions of its width).
class _Band extends CustomClipper<Rect> {
  const _Band({required this.start, required this.end, required this.rtl});
  final double start, end;
  final bool rtl;
  @override
  Rect getClip(Size size) {
    final a = (start.clamp(0, 1) * size.width).toDouble(), b = (end.clamp(0, 1) * size.width).toDouble();
    return rtl ? Rect.fromLTRB(size.width - b, 0, size.width - a, size.height) : Rect.fromLTRB(a, 0, b, size.height);
  }

  @override
  bool shouldReclip(_Band old) => old.start != start || old.end != end || old.rtl != rtl;
}
