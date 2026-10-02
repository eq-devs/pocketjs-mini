import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'native.dart';

void main() => runApp(const MiniApp());

class MiniApp extends StatelessWidget {
  const MiniApp({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Scaffold(body: SafeArea(child: PocketSurface())),
  );
}

class PocketSurface extends StatefulWidget {
  const PocketSurface({super.key});
  @override
  PocketSurfaceState createState() => PocketSurfaceState();
}

class PocketSurfaceState extends State<PocketSurface>
    with WidgetsBindingObserver {
  final _client = HttpClient()..connectionTimeout = const Duration(seconds: 3);
  final _base = Uri.parse(
    const String.fromEnvironment(
      'PJM_URL',
      defaultValue: 'http://127.0.0.1:8130/',
    ),
  );
  PocketEngine? _engine;
  ui.Image? _image;
  Timer? _clock, _poll;
  String? _error;
  String? _runtimeError;
  int _failedRevision = -1;
  int revision = 0, frameHash = 0, presentedFrames = 0;
  int _contact = -1;
  int? _pointer;
  bool _polling = false, _decoding = false, _active = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _clock = Timer.periodic(
      const Duration(microseconds: 16667),
      (_) => _frame(),
    );
    _poll = Timer.periodic(const Duration(milliseconds: 300), (_) => _reload());
    _reload();
  }

  Future<Uint8List> _get(String path) async {
    final request = await _client.getUrl(_base.resolve(path));
    final response = await request.close();
    if (response.statusCode != 200)
      throw HttpException('Host returned ${response.statusCode}');
    final data = BytesBuilder();
    await for (final bytes in response.timeout(const Duration(seconds: 5))) {
      data.add(bytes);
    }
    return data.takeBytes();
  }

  Future<void> _reload() async {
    if (_polling || !mounted) return;
    _polling = true;
    var booting = false;
    try {
      final state =
          jsonDecode(utf8.decode(await _get('state'))) as Map<String, dynamic>;
      final next = state['revision'] as int;
      if (next > revision && next != _failedRevision) {
        final js = await _get('$next/app.js');
        final pak = await _get('$next/app.pak');
        if (!mounted) return;
        _failedRevision = next;
        booting = true;
        final replacement = PocketEngine(js, pak);
        try {
          replacement.tick();
          replacement.pixels();
        } catch (_) {
          replacement.dispose();
          rethrow;
        }
        _engine?.dispose();
        _engine = replacement;
        revision = next;
        _failedRevision = -1;
        _runtimeError = null;
        _contact = -1;
        _pointer = null;
        frameHash = 0;
      }
      final message = state['error'] as String? ?? _runtimeError;
      if (mounted && _error != message) setState(() => _error = message);
    } catch (error) {
      if (booting) _runtimeError = '$error';
      if (mounted && _error != '$error') setState(() => _error = '$error');
    } finally {
      _polling = false;
    }
  }

  void _frame() {
    if (!mounted || !_active || _engine == null) return;
    try {
      _engine!.tick(_contact);
      if (_decoding) return;
      final pixels = _engine!.pixels();
      var hash = 0x811c9dc5;
      for (final byte in pixels) {
        hash = ((hash ^ byte) * 0x01000193) & 0xffffffff;
      }
      if (hash == frameHash && _image != null) return;
      _decoding = true;
      final current = revision;
      ui.decodeImageFromPixels(
        pixels,
        PocketEngine.width,
        PocketEngine.height,
        ui.PixelFormat.bgra8888,
        (image) {
          _decoding = false;
          if (!mounted || current != revision) {
            image.dispose();
            return;
          }
          final old = _image;
          setState(() {
            _image = image;
            frameHash = hash;
            presentedFrames++;
          });
          if (old != null)
            WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
        },
      );
    } catch (error) {
      _engine?.dispose();
      _engine = null;
      _failedRevision = revision;
      _runtimeError = '$error';
      setState(() => _error = '$error');
    }
  }

  void _point(PointerEvent event, Size size) {
    final x = (event.localPosition.dx / size.width * PocketEngine.width)
        .floor()
        .clamp(0, 479);
    final y = (event.localPosition.dy / size.height * PocketEngine.height)
        .floor()
        .clamp(0, 271);
    _contact = (y << 9) | x;
    _frame();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed && _pointer != null) {
      _contact = 0x40000000;
      _frame();
      _contact = -1;
      _pointer = null;
    }
    _active = state == AppLifecycleState.resumed;
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      const Padding(
        padding: EdgeInsets.all(16),
        child: Text('PocketJS Mini', style: TextStyle(fontSize: 18)),
      ),
      if (_error != null)
        Container(
          key: const Key('error'),
          color: Colors.red.shade50,
          padding: const EdgeInsets.all(12),
          width: double.infinity,
          child: Text(_error!, maxLines: 6, overflow: TextOverflow.ellipsis),
        ),
      Expanded(
        child: Center(
          child: AspectRatio(
            aspectRatio: 480 / 272,
            child: LayoutBuilder(
              builder: (context, box) => Listener(
                key: const Key('pocket-surface'),
                behavior: HitTestBehavior.opaque,
                onPointerDown: (event) {
                  if (_pointer == null) {
                    _pointer = event.pointer;
                    _point(event, box.biggest);
                  }
                },
                onPointerMove: (event) {
                  if (_pointer == event.pointer) _point(event, box.biggest);
                },
                onPointerUp: (event) {
                  if (_pointer == event.pointer) {
                    _contact = -1;
                    _pointer = null;
                    _frame();
                  }
                },
                onPointerCancel: (event) {
                  if (_pointer == event.pointer) {
                    _contact = 0x40000000;
                    _frame();
                    _contact = -1;
                    _pointer = null;
                  }
                },
                child: _image == null
                    ? const Center(child: Text('Starting app…'))
                    : RawImage(image: _image, fit: BoxFit.fill),
              ),
            ),
          ),
        ),
      ),
    ],
  );

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _clock?.cancel();
    _poll?.cancel();
    _client.close(force: true);
    _engine?.dispose();
    _image?.dispose();
    super.dispose();
  }
}
