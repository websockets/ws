/**
 * @license Highcharts JS v2.1.9 (2011-11-11)
 * Prototype adapter
 *
 * @author Michael Nelson, Torstein Hønsi.
 *
 * Feel free to use and modify this script.
 * Highcharts license: www.highcharts.com/license.
 */

/*
 * Known issues:
 *    - Some grid lines land in wrong position - http://jsfiddle.net/highcharts/jaRhY/28
 */

// JSLint options:
/*global Effect, Class, Event, $, $A */

// Adapter interface between prototype and the Highcharts charting library
var HighchartsAdapter = (function () {

var hasEffect = typeof Effect !== 'undefined';

return {

	/**
	 * Initialize the adapter. This is run once as Highcharts is first run.
	 * @param {Object} pathAnim The helper object to do animations across adapters.
	 */
	init: function (pathAnim) {
		if (hasEffect) {
			/**
			 * Animation for Highcharts SVG element wrappers only
			 * @param {Object} element
			 * @param {Object} attribute
			 * @param {Object} to
			 * @param {Object} options
			 */
			Effect.HighchartsTransition = Class.create(Effect.Base, {
				initialize: function (element, attr, to, options) {
					var from,
						opts;

					this.element = element;
					this.key = attr;
					from = element.attr(attr);

					// special treatment for paths
					if (attr === 'd') {
						this.paths = pathAnim.init(
							element,
							element.d,
							to
						);
						this.toD = to;


						// fake values in order to read relative position as a float in update
						from = 0;
						to = 1;
					}

					opts = Object.extend((options || {}), {
						from: from,
						to: to,
						attribute: attr
					});
					this.start(opts);
				},
				setup: function () {
					HighchartsAdapter._extend(this.element);
					// If this is the first animation on this object, create the _highcharts_animation helper that
					// contain pointers to the animation objects.
					if (!this.element._highchart_animation) {
						this.element._highchart_animation = {};
					}

					// Store a reference to this animation instance.
					this.element._highchart_animation[this.key] = this;
				},
				update: function (position) {
					var paths = this.paths;

					if (paths) {
						position = pathAnim.step(paths[0], paths[1], position, this.toD);
					}

					this.element.attr(this.options.attribute, position);
				},
				finish: function () {
					// Delete the property that holds this animation now that it is finished.
					// Both canceled animations and complete ones gets a 'finish' call.
					delete this.element._highchart_animation[this.key];
				}
			});
		}
	},

	/**
	 * Custom events in prototype needs to be namespaced. This method adds a namespace 'h:' in front of
	 * events that are not recognized as native.
	 */
	addNS: function (eventName) {
		var HTMLEvents = /^(?:load|unload|abort|error|select|change|submit|reset|focus|blur|resize|scroll)$/,
			MouseEvents = /^(?:click|mouse(?:down|up|over|move|out))$/;
		return (HTMLEvents.test(eventName) || MouseEvents.test(eventName)) ?
			eventName :
			'h:' + eventName;
	},

	// el needs an event to be attached. el is not necessarily a dom element
	addEvent: function (el, event, fn) {
		if (el.addEventListener || el.attachEvent) {
			Event.observe($(el), HighchartsAdapter.addNS(event), fn);

		} else {
			HighchartsAdapter._extend(el);
			el._highcharts_observe(event, fn);
		}
	},

	// motion makes things pretty. use it if effects is loaded, if not... still get to the end result.
	animate: function (el, params, options) {
		var key,
			fx;

		// default options
		options = options || {};
		options.delay = 0;
		options.duration = (options.duration || 500) / 1000;

		// animate wrappers and DOM elements
		if (hasEffect) {
			for (key in params) {
				// The fx variable is seemingly thrown away here, but the Effect.setup will add itself to the _highcharts_animation object
				// on the element itself so its not really lost.
				fx = new Effect.HighchartsTransition($(el), key, params[key], options);
			}
		} else {
			for (key in params) {
				el.attr(key, params[key]);
			}
		}

		if (!el.attr) {
			throw 'Todo: implement animate DOM objects';
		}
	},

	// this only occurs in higcharts 2.0+
	stop: function (el) {
		var key;
		if (el._highcharts_extended && el._highchart_animation) {
			for (key in el._highchart_animation) {
				// Cancel the animation
				// The 'finish' function in the Effect object will remove the reference
				el._highchart_animation[key].cancel();
			}
		}
	},

	// um.. each
	each: function (arr, fn) {
		$A(arr).each(fn);
	},

	// fire an event based on an event name (event) and an object (el).
	// again, el may not be a dom element
	fireEvent: function (el, event, eventArguments, defaultFunction) {
		if (el.fire) {
			el.fire(HighchartsAdapter.addNS(event), eventArguments);
		} else if (el._highcharts_extended) {
			eventArguments = eventArguments || {};
			el._highcharts_fire(event, eventArguments);
		}

		if (eventArguments && eventArguments.defaultPrevented) {
			defaultFunction = null;
		}

		if (defaultFunction) {
			defaultFunction(eventArguments);
		}
	},

	removeEvent: function (el, event, handler) {
		if ($(el).stopObserving) {
			if (event) {
				event = HighchartsAdapter.addNS(event);
			}
			$(el).stopObserving(event, handler);
		} if (window === el) {
			Event.stopObserving(el, event, handler);
		} else {
			HighchartsAdapter._extend(el);
			el._highcharts_stop_observing(event, handler);
		}
	},

	// um, grep
	grep: function (arr, fn) {
		return arr.findAll(fn);
	},

	// um, map
	map: function (arr, fn) {
		return arr.map(fn);
	},

	// deep merge. merge({a : 'a', b : {b1 : 'b1', b2 : 'b2'}}, {b : {b2 : 'b2_prime'}, c : 'c'}) => {a : 'a', b : {b1 : 'b1', b2 : 'b2_prime'}, c : 'c'}
	/*merge: function(){
		function doCopy(copy, original) {
			var value,
				key,
				undef,
				nil,
				same,
				obj,
				arr,
				node;

			for (key in original) {
				value = original[key];
				undef = typeof(value) === 'undefined';
				nil = value === null;
				same = original === copy[key];

				if (undef || nil || same) {
					continue;
				}

				obj = typeof(value) === 'object';
				arr = value && obj && value.constructor == Array;
				node = !!value.nodeType;

				if (obj && !arr && !node) {
					copy[key] = doCopy(typeof copy[key] == 'object' ? copy[key] : {}, value);
				}
				else {
					copy[key] = original[key];
				}
			}
			return copy;
		}

		var args = arguments, retVal = {};

		for (var i = 0; i < args.length; i++) {
			retVal = doCopy(retVal, args[i]);
		}

		return retVal;
	},*/
	merge: function () { // the built-in prototype merge function doesn't do deep copy
		function doCopy(copy, original) {
			var value, key;

			for (key in original) {
				value = original[key];
				if (value && typeof value === 'object' && value.constructor !== Array &&
						typeof value.nodeType !== 'number') {
					copy[key] = doCopy(copy[key] || {}, value); // copy

				} else {
					copy[key] = original[key];
				}
			}
			return copy;
		}

		function merge() {
			var args = arguments,
				i,
				retVal = {};

			for (i = 0; i < args.length; i++) {
				retVal = doCopy(retVal, args[i]);

			}
			return retVal;
		}

		return merge.apply(this, arguments);
	},

	// extend an object to handle highchart events (highchart objects, not svg elements).
	// this is a very simple way of handling events but whatever, it works (i think)
	_extend: function (object) {
		if (!object._highcharts_extended) {
			Object.extend(object, {
				_highchart_events: {},
				_highchart_animation: null,
				_highcharts_extended: true,
				_highcharts_observe: function (name, fn) {
					this._highchart_events[name] = [this._highchart_events[name], fn].compact().flatten();
				},
				_highcharts_stop_observing: function (name, fn) {
					if (name) {
						if (fn) {
							this._highchart_events[name] = [this._highchart_events[name]].compact().flatten().without(fn);
						} else {
							delete this._highchart_events[name];
						}
					} else {
						this._highchart_events = {};
					}
				},
				_highcharts_fire: function (name, args) {
					(this._highchart_events[name] || []).each(function (fn) {
						// args is never null here
						if (args.stopped) {
							return; // "throw $break" wasn't working. i think because of the scope of 'this'.
						}

						// Attach a simple preventDefault function to skip default handler if called
						args.preventDefault = function () {
							args.defaultPrevented = true;
						};

						// If the event handler return false, prevent the default handler from executing
						if (fn.bind(this)(args) === false) {
							args.preventDefault();
						}
					}
.bind(this));
				}
			});
		}
	}
};
}());
