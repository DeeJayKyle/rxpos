// The processor of an Android phone, as the per-processor APKs are named (not on the web: no dart:ffi there).
import 'dart:ffi' show Abi;

String? androidAbi() => switch (Abi.current()) { Abi.androidArm64 => 'arm64', Abi.androidArm => 'armv7', Abi.androidX64 => 'x64', _ => null };
