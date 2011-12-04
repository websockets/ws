/*
 Highcharts JS v2.1.9 (2011-11-11)
 MooTools adapter

 (c) 2010-2011 Torstein H?nsi

 License: www.highcharts.com/license
*/
(function(){var e=window,h=e.MooTools.version.substring(0,3),i=h==="1.2"||h==="1.1",m=i||h==="1.3",j=e.$extend||function(){return Object.append.apply(Object,arguments)};e.HighchartsAdapter={init:function(a){var b=Fx.prototype,c=b.start,d=Fx.Morph.prototype,g=d.compute;b.start=function(f){var k=this.element;if(f.d)this.paths=a.init(k,k.d,this.toD);c.apply(this,arguments);return this};d.compute=function(f,k,n){var l=this.paths;if(l)this.element.attr("d",a.step(l[0],l[1],n,this.toD));else return g.apply(this,
arguments)}},animate:function(a,b,c){var d=a.attr,g=c&&c.complete;if(d&&!a.setStyle){a.getStyle=a.attr;a.setStyle=function(){var f=arguments;a.attr.call(a,f[0],f[1][0])};a.$family=a.uid=true}e.HighchartsAdapter.stop(a);c=new Fx.Morph(d?a:$(a),j({transition:Fx.Transitions.Quad.easeInOut},c));if(b.d)c.toD=b.d;g&&c.addEvent("complete",g);c.start(b);a.fx=c},each:function(a,b){return i?$each(a,b):a.each(b)},map:function(a,b){return a.map(b)},grep:function(a,b){return a.filter(b)},merge:function(){var a=
arguments,b=[{}],c=a.length;if(i)a=$merge.apply(null,a);else{for(;c--;)if(typeof a[c]!=="boolean")b[c+1]=a[c];a=Object.merge.apply(Object,b)}return a},extendWithEvents:function(a){a.addEvent||(a.nodeName?$(a):j(a,new Events))},addEvent:function(a,b,c){if(typeof b==="string"){if(b==="unload")b="beforeunload";e.HighchartsAdapter.extendWithEvents(a);a.addEvent(b,c)}},removeEvent:function(a,b,c){if(typeof a!=="string"){e.HighchartsAdapter.extendWithEvents(a);if(b){if(b==="unload")b="beforeunload";c?a.removeEvent(b,
c):a.removeEvents(b)}else a.removeEvents()}},fireEvent:function(a,b,c,d){b={type:b,target:a};b=m?new Event(b):new DOMEvent(b);b=j(b,c);b.preventDefault=function(){d=null};a.fireEvent&&a.fireEvent(b.type,b);d&&d(b)},stop:function(a){a.fx&&a.fx.cancel()}}})();
