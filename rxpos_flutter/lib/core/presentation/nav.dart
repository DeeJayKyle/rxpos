// Every screen of the app in one list: its path, name, icon, shortcut key, the permission (and feature) it needs and
// the sidebar group it sits in. The sidebar, the shortcut keys and the router all read this list, as in the React app.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class Screen {
  const Screen(this.path, this.label, this.icon, this.group, this.builder, {this.permission, this.feature, this.key});
  final String path, label, group;
  final IconData icon;
  final String? permission, feature;
  final LogicalKeyboardKey? key;
  /// builds the screen; [q] are the link's query values (e.g. /inventory?filter=low)
  final Widget Function(Map<String, String> q) builder;

  String get keyLabel => key == null ? '' : key!.keyLabel;
  bool allowed(Set<String> can, Map<String, bool> features) =>
      (permission == null || can.contains(permission)) && (feature == null || features[feature] != false);
}

const navGroups = ['Sales', 'People', 'Medicine inventory', 'Finance', 'Insights', 'System'];
