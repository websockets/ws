/**
 * @license Highcharts JS v2.1.9 (2011-11-11)
 * Exporting module
 *
 * (c) 2010-2011 Torstein Hønsi
 *
 * License: www.highcharts.com/license
 */

// JSLint options:
/*global Highcharts, document, window, Math, setTimeout */

(function () { // encapsulate

// create shortcuts
var HC = Highcharts,
	Chart = HC.Chart,
	addEvent = HC.addEvent,
	removeEvent = HC.removeEvent,
	createElement = HC.createElement,
	discardElement = HC.discardElement,
	css = HC.css,
	merge = HC.merge,
	each = HC.each,
	extend = HC.extend,
	math = Math,
	mathMax = math.max,
	doc = document,
	win = window,
	hasTouch = doc.documentElement.ontouchstart !== undefined,
	M = 'M',
	L = 'L',
	DIV = 'div',
	HIDDEN = 'hidden',
	NONE = 'none',
	PREFIX = 'highcharts-',
	ABSOLUTE = 'absolute',
	PX = 'px',
	UNDEFINED,
	defaultOptions = HC.getOptions();

	// Add language
	extend(defaultOptions.lang, {
		downloadPNG: 'Download PNG image',
		downloadJPEG: 'Download JPEG image',
		downloadPDF: 'Download PDF document',
		downloadSVG: 'Download SVG vector image',
		exportButtonTitle: 'Export to raster or vector image',
		printButtonTitle: 'Print the chart'
	});

// Buttons and menus are collected in a separate config option set called 'navigation'.
// This can be extended later to add control buttons like zoom and pan right click menus.
defaultOptions.navigation = {
	menuStyle: {
		border: '1px solid #A0A0A0',
		background: '#FFFFFF'
	},
	menuItemStyle: {
		padding: '0 5px',
		background: NONE,
		color: '#303030',
		fontSize: hasTouch ? '14px' : '11px'
	},
	menuItemHoverStyle: {
		background: '#4572A5',
		color: '#FFFFFF'
	},

	buttonOptions: {
		align: 'right',
		backgroundColor: {
			linearGradient: [0, 0, 0, 20],
			stops: [
				[0.4, '#F7F7F7'],
				[0.6, '#E3E3E3']
			]
		},
		borderColor: '#B0B0B0',
		borderRadius: 3,
		borderWidth: 1,
		//enabled: true,
		height: 20,
		hoverBorderColor: '#909090',
		hoverSymbolFill: '#81A7CF',
		hoverSymbolStroke: '#4572A5',
		symbolFill: '#E0E0E0',
		//symbolSize: 12,
		symbolStroke: '#A0A0A0',
		//symbolStrokeWidth: 1,
		symbolX: 11.5,
		symbolY: 10.5,
		verticalAlign: 'top',
		width: 24,
		y: 10
	}
};



// Add the export related options
defaultOptions.exporting = {
	//enabled: true,
	//filename: 'chart',
	type: 'image/png',
	url: 'http://export.highcharts.com/',
	width: 800,
	enableImages: false,
	buttons: {
		exportButton: {
			//enabled: true,
			symbol: 'exportIcon',
			x: -10,
			symbolFill: '#A8BF77',
			hoverSymbolFill: '#768F3E',
			_id: 'exportButton',
			_titleKey: 'exportButtonTitle',
			menuItems: [{
				textKey: 'downloadPNG',
				onclick: function () {
					this.exportChart();
				}
			}, {
				textKey: 'downloadJPEG',
				onclick: function () {
					this.exportChart({
						type: 'image/jpeg'
					});
				}
			}, {
				textKey: 'downloadPDF',
				onclick: function () {
					this.exportChart({
						type: 'application/pdf'
					});
				}
			}, {
				textKey: 'downloadSVG',
				onclick: function () {
					this.exportChart({
						type: 'image/svg+xml'
					});
				}
			}/*, {
				text: 'View SVG',
				onclick: function() {
					var svg = this.getSVG()
						.replace(/</g, '\n&lt;')
						.replace(/>/g, '&gt;');

					doc.body.innerHTML = '<pre>'+ svg +'</pre>';
				}
			}*/]

		},
		printButton: {
			//enabled: true,
			symbol: 'printIcon',
			x: -36,
			symbolFill: '#B5C9DF',
			hoverSymbolFill: '#779ABF',
			_id: 'printButton',
			_titleKey: 'printButtonTitle',
			onclick: function () {
				this.print();
			}
		}
	}
};



extend(Chart.prototype, {
	/**
	 * Return an SVG representation of the chart
	 *
	 * @param additionalOptions {Object} Additional chart options for the generated SVG representation
	 */
	getSVG: function (additionalOptions) {
		var chart = this,
			chartCopy,
			sandbox,
			svg,
			seriesOptions,
			config,
			pointOptions,
			pointMarker,
			options = merge(chart.options, additionalOptions); // copy the options and add extra options

		// IE compatibility hack for generating SVG content that it doesn't really understand
		if (!doc.createElementNS) {
			/*jslint unparam: true*//* allow unused parameter ns in function below */
			doc.createElementNS = function (ns, tagName) {
				var elem = doc.createElement(tagName);
				elem.getBBox = function () {
					return HC.Renderer.prototype.Element.prototype.getBBox.apply({ element: elem });
				};
				return elem;
			};
			/*jslint unparam: false*/
		}

		// create a sandbox where a new chart will be generated
		sandbox = createElement(DIV, null, {
			position: ABSOLUTE,
			top: '-9999em',
			width: chart.chartWidth + PX,
			height: chart.chartHeight + PX
		}, doc.body);

		// override some options
		extend(options.chart, {
			renderTo: sandbox,
			forExport: true
		});
		options.exporting.enabled = false; // hide buttons in print

		if (!options.exporting.enableImages) {
			options.chart.plotBackgroundImage = null; // the converter doesn't handle images
		}

		// prepare for replicating the chart
		options.series = [];
		each(chart.series, function (serie) {
			seriesOptions = serie.options;

			seriesOptions.animation = false; // turn off animation
			seriesOptions.showCheckbox = false;
			seriesOptions.visible = serie.visible;

			if (!options.exporting.enableImages) {
				// remove image markers
				if (seriesOptions && seriesOptions.marker && /^url\(/.test(seriesOptions.marker.symbol)) {
					seriesOptions.marker.symbol = 'circle';
				}
			}

			seriesOptions.data = [];

			each(serie.data, function (point) {

				// extend the options by those values that can be expressed in a number or array config
				config = point.config;
				pointOptions = {
					x: point.x,
					y: point.y,
					name: point.name
				};

				if (typeof config === 'object' && point.config && config.constructor !== Array) {
					extend(pointOptions, config);
				}

				pointOptions.visible = point.visible;
				seriesOptions.data.push(pointOptions); // copy fresh updated data

				if (!options.exporting.enableImages) {
					// remove image markers
					pointMarker = point.config && point.config.marker;
					if (pointMarker && /^url\(/.test(pointMarker.symbol)) {
						delete pointMarker.symbol;
					}
				}
			});

			options.series.push(seriesOptions);
		});

		// generate the chart copy
		chartCopy = new Highcharts.Chart(options);

		// reflect axis extremes in the export
		each(['xAxis', 'yAxis'], function (axisType) {
			each(chart[axisType], function (axis, i) {
				var axisCopy = chartCopy[axisType][i],
					extremes = axis.getExtremes(),
					userMin = extremes.userMin,
					userMax = extremes.userMax;

				if (userMin !== UNDEFINED || userMax !== UNDEFINED) {
					axisCopy.setExtremes(userMin, userMax, true, false);
				}
			});
		});

		// get the SVG from the container's innerHTML
		svg = chartCopy.container.innerHTML;

		// free up memory
		options = null;
		chartCopy.destroy();
		discardElement(sandbox);

		// sanitize
		svg = svg
			.replace(/zIndex="[^"]+"/g, '')
			.replace(/isShadow="[^"]+"/g, '')
			.replace(/symbolName="[^"]+"/g, '')
			.replace(/jQuery[0-9]+="[^"]+"/g, '')
			.replace(/isTracker="[^"]+"/g, '')
			.replace(/url\([^#]+#/g, 'url(#')
			.replace(/<svg /, '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ')
			.replace(/ href=/g, ' xlink:href=')
			/*.replace(/preserveAspectRatio="none">/g, 'preserveAspectRatio="none"/>')*/
			/* This fails in IE < 8
			.replace(/([0-9]+)\.([0-9]+)/g, function(s1, s2, s3) { // round off to save weight
				return s2 +'.'+ s3[0];
			})*/

			// Replace HTML entities, issue #347
			.replace(/&nbsp;/g, '\u00A0') // no-break space
			.replace(/&shy;/g,  '\u00AD') // soft hyphen

			// IE specific
			.replace(/id=([^" >]+)/g, 'id="$1"')
			.replace(/class=([^" ]+)/g, 'class="$1"')
			.replace(/ transform /g, ' ')
			.replace(/:(path|rect)/g, '$1')
			.replace(/<img ([^>]*)>/gi, '<image $1 />')
			.replace(/<\/image>/g, '') // remove closing tags for images as they'll never have any content
			.replace(/<image ([^>]*)([^\/])>/gi, '<image $1$2 />') // closes image tags for firefox
			.replace(/width=(\d+)/g, 'width="$1"')
			.replace(/height=(\d+)/g, 'height="$1"')
			.replace(/hc-svg-href="/g, 'xlink:href="')
			.replace(/style="([^"]+)"/g, function (s) {
				return s.toLowerCase();
			});

		// IE9 beta bugs with innerHTML. Test again with final IE9.
		svg = svg.replace(/(url\(#highcharts-[0-9]+)&quot;/g, '$1')
			.replace(/&quot;/g, "'");
		if (svg.match(/ xmlns="/g).length === 2) {
			svg = svg.replace(/xmlns="[^"]+"/, '');
		}

		return svg;
	},

	/**
	 * Submit the SVG representation of the chart to the server
	 * @param {Object} options Exporting options. Possible members are url, type and width.
	 * @param {Object} chartOptions Additional chart options for the SVG representation of the chart
	 */
	exportChart: function (options, chartOptions) {
		var form,
			chart = this,
			svg = chart.getSVG(chartOptions);

		// merge the options
		options = merge(chart.options.exporting, options);

		// create the form
		form = createElement('form', {
			method: 'post',
			action: options.url
		}, {
			display: NONE
		}, doc.body);

		// add the values
		each(['filename', 'type', 'width', 'svg'], function (name) {
			createElement('input', {
				type: HIDDEN,
				name: name,
				value: {
					filename: options.filename || 'chart',
					type: options.type,
					width: options.width,
					svg: svg
				}[name]
			}, null, form);
		});

		// submit
		form.submit();

		// clean up
		discardElement(form);
	},

	/**
	 * Print the chart
	 */
	print: function () {

		var chart = this,
			container = chart.container,
			origDisplay = [],
			origParent = container.parentNode,
			body = doc.body,
			childNodes = body.childNodes;

		if (chart.isPrinting) { // block the button while in printing mode
			return;
		}

		chart.isPrinting = true;

		// hide all body content
		each(childNodes, function (node, i) {
			if (node.nodeType === 1) {
				origDisplay[i] = node.style.display;
				node.style.display = NONE;
			}
		});

		// pull out the chart
		body.appendChild(container);

		// print
		win.print();

		// allow the browser to prepare before reverting
		setTimeout(function () {

			// put the chart back in
			origParent.appendChild(container);

			// restore all body content
			each(childNodes, function (node, i) {
				if (node.nodeType === 1) {
					node.style.display = origDisplay[i];
				}
			});

			chart.isPrinting = false;

		}, 1000);

	},

	/**
	 * Display a popup menu for choosing the export type
	 *
	 * @param {String} name An identifier for the menu
	 * @param {Array} items A collection with text and onclicks for the items
	 * @param {Number} x The x position of the opener button
	 * @param {Number} y The y position of the opener button
	 * @param {Number} width The width of the opener button
	 * @param {Number} height The height of the opener button
	 */
	contextMenu: function (name, items, x, y, width, height) {
		var chart = this,
			navOptions = chart.options.navigation,
			menuItemStyle = navOptions.menuItemStyle,
			chartWidth = chart.chartWidth,
			chartHeight = chart.chartHeight,
			cacheName = 'cache-' + name,
			menu = chart[cacheName],
			menuPadding = mathMax(width, height), // for mouse leave detection
			boxShadow = '3px 3px 10px #888',
			innerMenu,
			hide,
			menuStyle;

		// create the menu only the first time
		if (!menu) {

			// create a HTML element above the SVG
			chart[cacheName] = menu = createElement(DIV, {
				className: PREFIX + name
			}, {
				position: ABSOLUTE,
				zIndex: 1000,
				padding: menuPadding + PX
			}, chart.container);

			innerMenu = createElement(DIV, null,
				extend({
					MozBoxShadow: boxShadow,
					WebkitBoxShadow: boxShadow,
					boxShadow: boxShadow
				}, navOptions.menuStyle), menu);

			// hide on mouse out
			hide = function () {
				css(menu, { display: NONE });
			};

			addEvent(menu, 'mouseleave', hide);


			// create the items
			each(items, function (item) {
				if (item) {
					var div = createElement(DIV, {
						onmouseover: function () {
							css(this, navOptions.menuItemHoverStyle);
						},
						onmouseout: function () {
							css(this, menuItemStyle);
						},
						innerHTML: item.text || chart.options.lang[item.textKey]
					}, extend({
						cursor: 'pointer'
					}, menuItemStyle), innerMenu);

					div[hasTouch ? 'ontouchstart' : 'onclick'] = function () {
						hide();
						item.onclick.apply(chart, arguments);
					};

					// Keep references to menu divs to be able to destroy them
					chart.exportDivElements.push(div);
				}
			});

			// Keep references to menu and innerMenu div to be able to destroy them
			chart.exportDivElements.push(innerMenu, menu);

			chart.exportMenuWidth = menu.offsetWidth;
			chart.exportMenuHeight = menu.offsetHeight;
		}

		menuStyle = { display: 'block' };

		// if outside right, right align it
		if (x + chart.exportMenuWidth > chartWidth) {
			menuStyle.right = (chartWidth - x - width - menuPadding) + PX;
		} else {
			menuStyle.left = (x - menuPadding) + PX;
		}
		// if outside bottom, bottom align it
		if (y + height + chart.exportMenuHeight > chartHeight) {
			menuStyle.bottom = (chartHeight - y - menuPadding)  + PX;
		} else {
			menuStyle.top = (y + height - menuPadding) + PX;
		}

		css(menu, menuStyle);
	},

	/**
	 * Add the export button to the chart
	 */
	addButton: function (options) {
		var chart = this,
			renderer = chart.renderer,
			btnOptions = merge(chart.options.navigation.buttonOptions, options),
			onclick = btnOptions.onclick,
			menuItems = btnOptions.menuItems,
			/*position = chart.getAlignment(btnOptions),
			buttonLeft = position.x,
			buttonTop = position.y,*/
			buttonWidth = btnOptions.width,
			buttonHeight = btnOptions.height,
			box,
			symbol,
			button,
			borderWidth = btnOptions.borderWidth,
			boxAttr = {
				stroke: btnOptions.borderColor

			},
			symbolAttr = {
				stroke: btnOptions.symbolStroke,
				fill: btnOptions.symbolFill
			};

		// Keeps references to the button elements
		if (!chart.exportDivElements) {
			chart.exportDivElements = [];
			chart.exportSVGElements = [];
		}

		if (btnOptions.enabled === false) {
			return;
		}

		// element to capture the click
		function revert() {
			symbol.attr(symbolAttr);
			box.attr(boxAttr);
		}

		// the box border
		box = renderer.rect(
			0,
			0,
			buttonWidth,
			buttonHeight,
			btnOptions.borderRadius,
			borderWidth
		)
		//.translate(buttonLeft, buttonTop) // to allow gradients
		.align(btnOptions, true)
		.attr(extend({
			fill: btnOptions.backgroundColor,
			'stroke-width': borderWidth,
			zIndex: 19
		}, boxAttr)).add();

		// the invisible element to track the clicks
		button = renderer.rect(
				0,
				0,
				buttonWidth,
				buttonHeight,
				0
			)
			.align(btnOptions)
			.attr({
				id: btnOptions._id,
				fill: 'rgba(255, 255, 255, 0.001)',
				title: chart.options.lang[btnOptions._titleKey],
				zIndex: 21
			}).css({
				cursor: 'pointer'
			})
			.on('mouseover', function () {
				symbol.attr({
					stroke: btnOptions.hoverSymbolStroke,
					fill: btnOptions.hoverSymbolFill
				});
				box.attr({
					stroke: btnOptions.hoverBorderColor
				});
			})
			.on('mouseout', revert)
			.on('click', revert)
			.add();

		//addEvent(button.element, 'click', revert);

		// add the click event
		if (menuItems) {
			onclick = function () {
				revert();
				var bBox = button.getBBox();
				chart.contextMenu('export-menu', menuItems, bBox.x, bBox.y, buttonWidth, buttonHeight);
			};
		}
		/*addEvent(button.element, 'click', function() {
			onclick.apply(chart, arguments);
		});*/
		button.on('click', function () {
			onclick.apply(chart, arguments);
		});

		// the icon
		symbol = renderer.symbol(
				btnOptions.symbol,
				btnOptions.symbolX,
				btnOptions.symbolY,
				(btnOptions.symbolSize || 12) / 2
			)
			.align(btnOptions, true)
			.attr(extend(symbolAttr, {
				'stroke-width': btnOptions.symbolStrokeWidth || 1,
				zIndex: 20
			})).add();

		// Keep references to the renderer element so to be able to destroy them later.
		chart.exportSVGElements.push(box, button, symbol);
	},

	/**
	 * Destroy the buttons.
	 */
	destroyExport: function () {
		var i,
			chart = this,
			elem;

		// Destroy the extra buttons added
		for (i = 0; i < chart.exportSVGElements.length; i++) {
			elem = chart.exportSVGElements[i];
			// Destroy and null the svg/vml elements
			elem.onclick = elem.ontouchstart = null;
			chart.exportSVGElements[i] = elem.destroy();
		}

		// Destroy the divs for the menu
		for (i = 0; i < chart.exportDivElements.length; i++) {
			elem = chart.exportDivElements[i];

			// Remove the event handler
			removeEvent(elem, 'mouseleave');

			// Remove inline events
			chart.exportDivElements[i] = elem.onmouseout = elem.onmouseover = elem.ontouchstart = elem.onclick = null;

			// Destroy the div by moving to garbage bin
			discardElement(elem);
		}
	}
});

// Create the export icon
HC.Renderer.prototype.symbols.exportIcon = function (x, y, radius) {
	return [
		M, // the disk
		x - radius, y + radius,
		L,
		x + radius, y + radius,
		x + radius, y + radius * 0.5,
		x - radius, y + radius * 0.5,
		'Z',
		M, // the arrow
		x, y + radius * 0.5,
		L,
		x - radius * 0.5, y - radius / 3,
		x - radius / 6, y - radius / 3,
		x - radius / 6, y - radius,
		x + radius / 6, y - radius,
		x + radius / 6, y - radius / 3,
		x + radius * 0.5, y - radius / 3,
		'Z'
	];
};
// Create the print icon
HC.Renderer.prototype.symbols.printIcon = function (x, y, radius) {
	return [
		M, // the printer
		x - radius, y + radius * 0.5,
		L,
		x + radius, y + radius * 0.5,
		x + radius, y - radius / 3,
		x - radius, y - radius / 3,
		'Z',
		M, // the upper sheet
		x - radius * 0.5, y - radius / 3,
		L,
		x - radius * 0.5, y - radius,
		x + radius * 0.5, y - radius,
		x + radius * 0.5, y - radius / 3,
		'Z',
		M, // the lower sheet
		x - radius * 0.5, y + radius * 0.5,
		L,
		x - radius * 0.75, y + radius,
		x + radius * 0.75, y + radius,
		x + radius * 0.5, y + radius * 0.5,
		'Z'
	];
};


// Add the buttons on chart load
Chart.prototype.callbacks.push(function (chart) {
	var n,
		exportingOptions = chart.options.exporting,
		buttons = exportingOptions.buttons;

	if (exportingOptions.enabled !== false) {

		for (n in buttons) {
			chart.addButton(buttons[n]);
		}

		// Destroy the export elements at chart destroy
		addEvent(chart, 'destroy', chart.destroyExport);
	}

});


}());
