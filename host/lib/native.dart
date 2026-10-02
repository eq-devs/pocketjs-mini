import 'dart:ffi';
import 'dart:typed_data';
import 'package:ffi/ffi.dart';

@Native<Pointer<Void> Function(Pointer<Uint8>, Size, Pointer<Uint8>, Size)>(
  symbol: 'pjm_create',
)
external Pointer<Void> _create(
  Pointer<Uint8> js,
  int jsLength,
  Pointer<Uint8> pak,
  int pakLength,
);
@Native<Pointer<Utf8> Function()>(symbol: 'pjm_error')
external Pointer<Utf8> _error();
@Native<Int32 Function(Pointer<Void>, Int64)>(symbol: 'pjm_tick')
external int _tick(Pointer<Void> handle, int contact);
@Native<Pointer<Uint8> Function(Pointer<Void>)>(symbol: 'pjm_pixels')
external Pointer<Uint8> _pixels(Pointer<Void> handle);
@Native<Void Function(Pointer<Void>)>(symbol: 'pjm_destroy')
external void _destroy(Pointer<Void> handle);

class PocketEngine {
  static const width = 480, height = 272;
  Pointer<Void> _handle = nullptr;
  PocketEngine(Uint8List js, Uint8List pak) {
    final source = calloc<Uint8>(js.length);
    final assets = calloc<Uint8>(pak.length);
    try {
      source.asTypedList(js.length).setAll(0, js);
      assets.asTypedList(pak.length).setAll(0, pak);
      _handle = _create(source, js.length, assets, pak.length);
      if (_handle == nullptr) throw StateError(_error().toDartString());
    } finally {
      calloc.free(source);
      calloc.free(assets);
    }
  }
  void tick([int contact = -1]) {
    if (_handle == nullptr) throw StateError('PocketJS engine is closed');
    if (_tick(_handle, contact) != 0) throw StateError(_error().toDartString());
  }

  Uint8List pixels() {
    if (_handle == nullptr) throw StateError('PocketJS engine is closed');
    final data = _pixels(_handle);
    if (data == nullptr) throw StateError(_error().toDartString());
    return Uint8List.fromList(data.asTypedList(width * height * 4));
  }

  void dispose() {
    if (_handle != nullptr) {
      _destroy(_handle);
      _handle = nullptr;
    }
  }
}
