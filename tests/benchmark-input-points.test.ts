import {test,expect} from 'bun:test';
import {benchmarkInputPoints} from './benchmark-input-points.ts';
const node=(kind:string,bounds='[0,0][1170,2532]',frames='1')=>`<node class="${kind}" package="dev.pjm.benchmark.validation" content-desc="signed=dev.pjm.benchmark version=0.0.1 frames=${frames}" bounds="${bounds}" />`;
test('benchmark input uses authenticated surface and fitted viewport across Android accessibility classes',()=>{
 for(const kind of ['android.view.SurfaceView','android.opengl.GLSurfaceView','android.view.View'])expect(benchmarkInputPoints(node(kind))).toEqual([585,1950,585,600,1020,96]);
 expect(benchmarkInputPoints(node('android.view.View','[0,63][1080,1794]'))).toEqual([540,1396,540,473,837,129]);
});
test('benchmark input rejects ambiguous, unready, foreign and invalid bounds before generating gestures',()=>{
 for(const xml of ['',node('android.view.View')+node('android.view.SurfaceView'),node('android.view.View',undefined,'0'),node('android.view.View','[10,10][10,20]'),node('android.view.View','[0,0][9000,9000]'),node('android.view.View').replace('dev.pjm.benchmark.validation','dev.other.app'),node('android.webkit.WebView')])expect(()=>benchmarkInputPoints(xml)).toThrow();
});
