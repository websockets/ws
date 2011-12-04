/**
 * @license Highcharts JS v2.1.9 (2011-11-11)
 * MooTools adapter
 *
 * (c) 2010-2011 Torstein Hønsi
 *
 * License: www.highcharts.com/license
 */

// JSLint options:
/*global Fx, $, $extend, $each, $merge, Events, Event, DOMEvent */

(function () {

var win = window,
	mooVersion = win.MooTools.version.substring(0, 3), // Get the first three characters of the version number
	legacy = mooVersion === '1.2' || mooVersion === '1.1', // 1.1 && 1.2 considered legacy, 1.3 is not.
	legacyEvent = legacy || mooVersion === '1.3', // In versions 1.1 - 1.3 the event class is named Event, in newer versions it is named DOMEvent.
	$extend = win.$extend || function () {
		return Object.append.apply(Object, arguments);
	};

win.HighchartsAdapter = {
	/**
	 * Initialize the adapter. This is run once as Highcharts is first run.
	 * @param {Object} pathAnim The helper object to do animations across adapters.
	 */
	init: function (pathAnim) {
		var fxProto = Fx.prototype,
			fxStart = fxProto.start,
			morphProto = Fx.Morph.prototype,
			morphCompute = morphProto.compute;

		// override Fx.start to allow animation of SVG element wrappers
		/*jslint unparam: true*//* allow unused parameters in fx functions */
		fxProto.start = function (from, to) {
			var fx = this,
				elem = fx.element;

			// special for animating paths
			if (from.d) {
				//this.fromD = this.element.d.split(' ');
				fx.paths = pathAnim.init(
					elem,
					elem.d,
					fx.toD
				);
			}
			fxStart.apply(fx, arguments);

			return this; // chainable
		};

		// override Fx.step to allow animation of SVG element wrappers
		morphProto.compute = function (from, to, delta) {
			var fx = this,
				paths = fx.paths;

			if (paths) {
				fx.element.attr(
					'd',
					pathAnim.step(paths[0], paths[1], delta, fx.toD)
				);
			} else {
				return morphCompute.apply(fx, arguments);
			}
		};
		/*jslint unparam: false*/
	},

	/**
	 * Animate a HTML element or SVG element wrapper
	 * @param {Object} el
	 * @param {Object} params
	 * @param {Object} options jQuery-like animation options: duration, easing, callback
	 */
	animate: function (el, params, options) {
		var isSVGElement = el.attr,
			effect,
			complete = options && options.complete;

		if (isSVGElement && !el.setStyle) {
			// add setStyle and getStyle methods for internal use in Moo
			el.getStyle = el.attr;
			el.setStyle = function () { // property value is given as array in Moo - break it down
				var args = arguments;
				el.attr.call(el, args[0], args[1][0]);
			};
			// dirty hack to trick Moo into handling el as an element wrapper
			el.$family = el.uid = true;
		}

		// stop running animations
		win.HighchartsAdapter.stop(el);

		// define and run the effect
		effect = new Fx.Morph(
			isSVGElement ? el : $(el),
			$extend({
				transition: Fx.Transitions.Quad.easeInOut
			}, options)
		);

		// special treatment for paths
		if (params.d) {
			effect.toD = params.d;
		}

		// jQuery-like events
		if (complete) {
			effect.addEvent('complete', complete);
		}

		// run
		effect.start(params);

		// record for use in stop method
		el.fx = effect;
	},

	/**
	 * MooTool's each function
	 *
	 */
	each: function (arr, fn) {
		return legacy ?
			$each(arr, fn) :
			arr.each(fn);
	},

	/**
	 * Map an array
	 * @param {Array} arr
	 * @param {Function} fn
	 */
	map: function (arr, fn) {
		return arr.map(fn);
	},

	/**
	 * Grep or filter an array
	 * @param {Array} arr
	 * @param {Function} fn
	 */
	grep: function (arr, fn) {
		return arr.filter(fn);
	},

	/**
	 * Deep merge two objects and return a third
	 */
	merge: function () {
		var args = arguments,
			args13 = [{}], // MooTools 1.3+
			i = args.length,
			ret;

		if (legacy) {
			ret = $merge.apply(null, args);
		} else {
			while (i--) {
				// Boolean argumens should not be merged.
				// JQuery explicitly skips this, so we do it here as well.
				if (typeof args[i] !== 'boolean') {
					args13[i + 1] = args[i];
				}
			}
			ret = Object.merge.apply(Object, args13);
		}

		return ret;
	},

	/**
	 * Extends an object with Events, if its not done
	 */
	extendWithEvents: function (el) {
		// if the addEvent method is not defined, el is a custom Highcharts object
		// like series or point
		if (!el.addEvent) {
			if (el.nodeName) {
				el = $(el); // a dynamically generated node
			} else {
				$extend(el, new Events()); // a custom object
			}
		}
	},

	/**
	 * Add an event listener
	 * @param {Object} el HTML element or custom object
	 * @param {String} type Event type
	 * @param {Function} fn Event handler
	 */
	addEvent: function (el, type, fn) {
		if (typeof type === 'string') { // chart broke due to el being string, type function

			if (type === 'unload') { // Moo self destructs before custom unload events
				type = 'beforeunload';
			}

			win.HighchartsAdapter.extendWithEvents(el);

			el.addEvent(type, fn);
		}
	},

	removeEvent: function (el, type, fn) {
		if (typeof el === 'string') {
			// el.removeEvents below apperantly calls this method again. Do not quite understand why, so for now just bail out.
			return;
		}
		win.HighchartsAdapter.extendWithEvents(el);
		if (type) {
			if (type === 'unload') { // Moo self destructs before custom unload events
				type = 'beforeunload';
			}

			if (fn) {
				el.removeEvent(type, fn);
			} else {
				el.removeEvents(type);
			}
		} else {
			el.removeEvents();
		}
	},

	fireEvent: function (el, event, eventArguments, defaultFunction) {
		var eventArgs = {
			type: event,
			target: el
		};
		// create an event object that keeps all functions
		event = legacyEvent ? new Event(eventArgs) : new DOMEvent(eventArgs);
		event = $extend(event, eventArguments);
		// override the preventDefault function to be able to use
		// this for custom events
		event.preventDefault = function () {
			defaultFunction = null;
		};
		// if fireEvent is not available on the object, there hasn't been added
		// any events to it above
		if (el.fireEvent) {
			el.fireEvent(event.type, event);
		}

		// fire the default if it is passed and it is not prevented above
		if (defaultFunction) {
			defaultFunction(event);
		}
	},

	/**
	 * Stop running animations on the object
	 */
	stop: function (el) {
		if (el.fx) {
			el.fx.cancel();
		}
	}
};

}());
