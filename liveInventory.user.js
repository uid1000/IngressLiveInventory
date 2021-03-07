// ==UserScript==
// @id keyInventory
// @name IITC Plugin: Key Inventory
// @category Info
// @version 0.0.1
// @namespace	https://github.com/uid1000/IngressLiveInventory
// @downloadURL	https://github.com/uid1000/IngressLiveInventory/raw/main/liveInventory.user.js
// @updateURL	https://github.com/uid1000/IngressLiveInventory/raw/main/liveInventory.user.js
// @homepageURL	https://github.com/uid1000/IngressLiveInventory
// @description Show current ingame key inventory
// @author uid1000
// @include		https://intel.ingress.com/*
// @match		https://intel.ingress.com/*
// @grant			none
// ==/UserScript==

// Forked from https://github.com/EisFrei/IngressLiveInventory

function wrapper(plugin_info) {

	// Make sure that window.plugin exists. IITC defines it as a no-op function,
	// and other plugins assume the same.
	if (typeof window.plugin !== "function") window.plugin = function () { };
	const KEY_SETTINGS = "plugin-live-inventory";
	let settings = {
		displayMode: 'icon',
	};

	window.plugin.LiveInventory = function () { };

	const thisPlugin = window.plugin.LiveInventory;
	// Name of the IITC build for first-party plugins
	plugin_info.buildName = "LiveInventory";

	// Datetime-derived version of the plugin
	plugin_info.dateTimeVersion = "202103070000";

	// ID/name of the plugin
	plugin_info.pluginId = "liveInventory";

	const translations = {
		BOOSTED_POWER_CUBE: 'Hypercube',
		CAPSULE: 'Capsule',
		DRONE: 'Drone',
		EMITTER_A: 'Resonator',
		EMP_BURSTER: 'XMP',
		EXTRA_SHIELD: 'Aegis Shield',
		FLIP_CARD: 'Virus',
		FORCE_AMP: 'Force Amp',
		HEATSINK: 'HS',
		INTEREST_CAPSULE: 'Quantum Capsule',
		KEY_CAPSULE: 'Key Capsule',
		KINETIC_CAPSULE: 'Kinetic Capsule',
		LINK_AMPLIFIER: 'LA',
		MEDIA: 'Media',
		MULTIHACK: 'Multi-Hack',
		PLAYER_POWERUP: 'Apex',
		PORTAL_LINK_KEY: 'Key',
		PORTAL_POWERUP: 'Fracker',
		POWER_CUBE: 'PC',
		RES_SHIELD: 'Shield',
		TRANSMUTER_ATTACK: 'ITO -',
		TRANSMUTER_DEFENSE: 'ITO +',
		TURRET: 'Turret',
		ULTRA_LINK_AMP: 'Ultra-Link',
		ULTRA_STRIKE: 'US',
	};

	function checkSubscription(callback) {
		var versionStr = niantic_params.CURRENT_VERSION;
		var post_data = JSON.stringify({
			v: versionStr
		});

		var result = $.ajax({
			url: '/r/getHasActiveSubscription',
			type: 'POST',
			data: post_data,
			context: {},
			dataType: 'json',
			success: [(data) => callback(null, data)],
			error: [(data) => callback(data)],
			contentType: 'application/json; charset=utf-8',
			beforeSend: function (req) {
				req.setRequestHeader('accept', '*/*');
				req.setRequestHeader('X-CSRFToken', readCookie('csrftoken'));
			}
		});
		return result;
	}


	function addItemToCount(item, countMap, incBy) {
		if (item[2] && item[2].resource && item[2].timedPowerupResource) {
			const key = `${item[2].resource.resourceType} ${item[2].timedPowerupResource.designation}`;
			if (!countMap[key]) {
				countMap[key] = item[2].resource;
				countMap[key].count = 0;
				countMap[key].type = `Powerup ${translations[item[2].timedPowerupResource.designation] || item[2].timedPowerupResource.designation}`;
			}
			countMap[key].count += incBy;
		} else if (item[2] && item[2].resource && item[2].flipCard) {
			const key = `${item[2].resource.resourceType} ${item[2].flipCard.flipCardType}`;
			if (!countMap[key]) {
				countMap[key] = item[2].resource;
				countMap[key].count = 0;
				countMap[key].type = `${translations[item[2].resource.resourceType]} ${item[2].flipCard.flipCardType}`;
			}
			countMap[key].flipCardType = item[2].flipCard.flipCardType;
			countMap[key].count += incBy;
		} else if (item[2] && item[2].resource) {
			const key = `${item[2].resource.resourceType} ${item[2].resource.resourceRarity}`;
			if (!countMap[key]) {
				countMap[key] = item[2].resource;
				countMap[key].count = 0;
				countMap[key].type = `${translations[item[2].resource.resourceType]}`;
			}
			countMap[key].count += incBy;
		} else if (item[2] && item[2].resourceWithLevels) {
			const key = `${item[2].resourceWithLevels.resourceType} ${item[2].resourceWithLevels.level}`;
			if (!countMap[key]) {
				countMap[key] = item[2].resourceWithLevels;
				countMap[key].count = 0;
				countMap[key].resourceRarity = 'COMMON';
				countMap[key].type = `${translations[item[2].resourceWithLevels.resourceType]} ${item[2].resourceWithLevels.level}`;
			}
			countMap[key].count += incBy;
		} else if (item[2] && item[2].modResource) {
			const key = `${item[2].modResource.resourceType} ${item[2].modResource.rarity}`;
			if (!countMap[key]) {
				countMap[key] = item[2].modResource;
				countMap[key].count = 0;
				countMap[key].type = `${translations[item[2].modResource.resourceType]}`;
				countMap[key].resourceRarity = countMap[key].rarity;
			}
			countMap[key].count += incBy;
		} else {
			console.log(item);
		}
	}

	function parseCapsuleNames(str) {
		const reg = new RegExp(/^([0-9a-f]{8}):(.+)$/, 'i');
		str = str || '';
		const map = {};
		const rows = str.split('\n')
			.map(e => reg.exec(e))
			.filter(e => e && e.length === 3)
			.forEach(e => map[e[1]] = e[2]);
		return map;
	}

	function svgToIcon(str, s) {
		const url = ("data:image/svg+xml," + encodeURIComponent(str)).replace(/#/g, '%23');
		return new L.Icon({
			iconUrl: url,
			iconSize: [s, s],
			iconAnchor: [s / 2, s / 2],
			className: 'no-pointer-events', //allows users to click on portal under the unique marker
		})
	}

	function createIcons() {
		if (settings.displayMode === 'marker') {
			thisPlugin.keyIcon = L.icon({
				iconUrl: 'data:image/png;base64,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',
				iconAnchor: [15, 40],
				iconSize: [30, 40]
			});
		} else {
			thisPlugin.keyIcon = svgToIcon(`<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-key" width="44" height="44" viewBox="0 0 24 24" stroke-width="2" stroke="#ffffff" fill="none" stroke-linecap="round" stroke-linejoin="round">
<circle cx="8" cy="15" r="4" />
<line x1="10.85" y1="12.15" x2="19" y2="4" />
<line x1="18" y1="5" x2="20" y2="7" />
<line x1="15" y1="8" x2="17" y2="10" />
</svg>`, 15);
		}
	}

	function addKeyMarker(guid, latlng, lbl) {
		/*
				const keyIcon = ("data:image/svg+xml," + encodeURIComponent(`<svg width="60" height="60" viewBox="0 0 316 540" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
		<g id="BASE">
		</g>
		<path d="M0,323L158,415L316,323L158,540L0,323Z" style="fill:rgb(120,179,44);"/>
		<path d="M160,0L1,92L1,275L159,367L316,275L316,91L160,0Z" style="fill:rgb(201,35,39);"/>
		<path d="M40.242,115.042L158.827,45.659L277.834,113.031L277.547,251.632L159.352,321.048L40.874,251.337L40.242,115.042Z" style="fill:rgb(120,179,44);"/>
		<g transform="matrix(0.263672,0,0,0.263672,92,115)">
		<path d="M512,176.001C512,273.203 433.202,352 336,352C324.78,352 313.81,350.938 303.173,348.931L279.161,375.945C274.609,381.066 268.075,384 261.223,384L224,384L224,424C224,437.255 213.255,448 200,448L160,448L160,488C160,501.255 149.255,512 136,512L24,512C10.745,512 0,501.255 0,488L0,409.941C0,403.576 2.529,397.471 7.029,392.97L168.831,231.168C163.108,213.814 160,195.271 160,176C160,78.798 238.797,0.001 335.999,0C433.488,-0.001 512,78.511 512,176.001ZM336,128C336,154.51 357.49,176 384,176C410.51,176 432,154.51 432,128C432,101.49 410.51,80 384,80C357.49,80 336,101.49 336,128Z" style="fill:white;fill-rule:nonzero;"/>
		</g>
		</svg>`));
		*/
		/*
					iconUrl: keyIcon,
					iconAnchor: [15, 40],
					iconSize: [30, 40]
		*/
		var key = L.marker(latlng, {
			title: lbl
		});

		window.registerMarkerForOMS(key);
		key.on('spiderfiedclick', function () { renderPortalDetails(guid); });

		window.plugin.bookmarks.starLayers[guid] = key;
		key.addTo(window.plugin.bookmarks.starLayerGroup);
	}

	function prepareItemCounts(data) {
		if (!data || !data.result) {
			return [];
		}
		const countMap = {};
		data.result.forEach((item) => {
			addItemToCount(item, countMap, 1);
			if (item[2].container) {
				item[2].container.stackableItems.forEach((item) => {
					addItemToCount(item.exampleGameEntity, countMap, item.itemGuids.length);
				});
			}
		});
		const countList = Object.values(countMap);
		countList.sort((a, b) => {
			if (a.type === b.type) {
				return 0;
			}
			return a.type > b.type ? 1 : -1;
		});
		return countList;
	}

	function HexToSignedFloat(num) {
		let int = parseInt(num, 16);
		if ((int & 0x80000000) === -0x80000000) {
			int = -1 * (int ^ 0xffffffff) + 1;
		}
		return int / 10e5;
	}

	function addKeyToCount(item, countMap, incBy, moniker) {
		if (item[2] && item[2].resource && item[2].resource.resourceType && item[2].resource.resourceType === 'PORTAL_LINK_KEY') {
			const key = `${item[2].portalCoupler.portalGuid}`;
			if (!countMap[key]) {
				countMap[key] = item[2];
				countMap[key].count = 0;
				countMap[key].capsules = [];
			}

			if (moniker && countMap[key].capsules.indexOf(moniker) === -1) {
				countMap[key].capsules.push(moniker);
			}

			countMap[key].count += incBy;
		}
	}

	function prepareKeyCounts(data) {
		if (!data || !data.result) {
			return [];
		}
		const countMap = {};
		data.result.forEach((item) => {
			addKeyToCount(item, countMap, 1);
			if (item[2].container) {
				item[2].container.stackableItems.forEach((item2) => {
					addKeyToCount(item2.exampleGameEntity, countMap, item2.itemGuids.length, item[2].moniker.differentiator);
				});
			}
		});
		const countList = Object.values(countMap);
		countList.sort((a, b) => {
			if (a.portalCoupler.portalTitle === b.portalCoupler.portalTitle) {
				return 0;
			}
			return a.portalCoupler.portalTitle.toLowerCase() > b.portalCoupler.portalTitle.toLowerCase() ? 1 : -1;
		});
		return countList;
	}

	function getKeyTableBody(orderBy, direction) {
		const capsuleNames = parseCapsuleNames(settings.capsuleNames);

		const sortFunctions = {
			name: (a, b) => {
				if (a.portalCoupler.portalTitle === b.portalCoupler.portalTitle) {
					return 0;
				}
				return (a.portalCoupler.portalTitle.toLowerCase() > b.portalCoupler.portalTitle.toLowerCase() ? 1 : -1) * (direction ? 1 : -1);
			},
			count: (a, b) => (a.count - b.count) * (direction ? 1 : -1),
			distance: (a, b) => (a._distance - b._distance) * (direction ? 1 : -1),
			capsule: (a, b) => {
				const sA = a.capsules.join(', ').toLowerCase();
				const sB = b.capsules.join(', ').toLowerCase();
				if (sA === sB) {
					return 0;
				}
				return (sA > sB ? 1 : -1) * (direction ? 1 : -1);
			}
		}

		thisPlugin.keyCount.sort(sortFunctions[orderBy]);
		return thisPlugin.keyCount.map((el) => {
			return `<tr>
<td><a href="//intel.ingress.com/?pll=${el._latlng.lat},${el._latlng.lng}" onclick="zoomToAndShowPortal('${el.portalCoupler.portalGuid}',[${el._latlng.lat},${el._latlng.lng}]); return false;">${el.portalCoupler.portalTitle}</a></td>
<td>${el.count}</td>
<td>${el._formattedDistance}</td>
<td>${el.capsules.map(e => capsuleNames[e] || e).join(', ')}</td>
</tr>`;
		}).join('');
	}

	function updateKeyTableBody(orderBy, direction) {
		$('#live-inventory-key-table tbody').empty().append($(getKeyTableBody(orderBy, direction)))
	}


	function getItemTableBody(orderBy, direction) {
		const sortFunctions = {
			type: (a, b) => {
				if (a.type === b.type) {
					return 0;
				}
				return (a.type.toLowerCase() > b.type.toLowerCase() ? 1 : -1) * (direction ? 1 : -1);
			},
			rarity: (a, b) => {
				if (a.resourceRarity === b.resourceRarity) {
					return 0;
				}
				return (a.resourceRarity.toLowerCase() > b.resourceRarity.toLowerCase() ? 1 : -1) * (direction ? 1 : -1);
			},
			count: (a, b) => (a.count - b.count) * (direction ? 1 : -1),
		};


		thisPlugin.itemCount.sort(sortFunctions[orderBy]);
		return thisPlugin.itemCount.map((el) => {
			return `<tr>
<td>${el.type}</td>
<td>${el.resourceRarity || ''}</td>
<td>${el.count}</td>
</tr>`;
		}).join('');
	}

	function updateItemTableBody(orderBy, direction) {
		$('#live-inventory-item-table tbody').empty().append($(getItemTableBody(orderBy, direction)))
	}

	function exportItems() {
		const str = ['Type\tRarity\tCount', ...thisPlugin.itemCount.map((i) => [i.type, i.resourceRarity, i.count].join('\t'))].join('\n');
		navigator.clipboard.writeText(str);
	}

	function exportKeys() {
		const capsuleNames = parseCapsuleNames(settings.capsuleNames);
		const str = ['Name\tLink\tGUID\tKeys\tCapsules', ...thisPlugin.keyCount.map((el) => [el.portalCoupler.portalTitle, `https//intel.ingress.com/?pll=${el._latlng.lat},${el._latlng.lng}`, el.portalCoupler.portalGuid, el.count, el.capsules.map(e => capsuleNames[e] || e).join(',')].join('\t'))].join('\n');
		navigator.clipboard.writeText(str);
	}

	function addKeyMarkers() {
		thisPlugin.keyCount.forEach(function (el, key) {
			console.log("Add marker: " + el.portalCoupler.portalTitle);
			addKeyMarker(el.portalCoupler.portalGuid, el._latlng, el.portalCoupler.portalTitle);
		})
	}

	function displayInventory() {
		dialog({
			html: `<div id="live-inventory">
<div id="live-inventory-tables">

<!--
<table id="live-inventory-item-table">
<thead>
<tr>
<th class="" data-orderby="type">Type</th>
<th class="" data-orderby="rarity">Rarity</th>
<th class="" data-orderby="count">Count</th>
</tr>
</thead>
<tbody>
${getItemTableBody('type', 1)}
</tbody>
</table>
<hr/>
-->

<table id="live-inventory-key-table">
<thead>
<tr>
<th class="" data-orderby="name">Portal</th>
<th class="" data-orderby="count">Count</th>
<th class="" data-orderby="distance">Distance</th>
<th class="" data-orderby="capsule">Capsules</th>
</tr>
</thead>
<tbody>
${getKeyTableBody('name', 1)}
</tbody>
</table>
</div>
<hr/>
<div id="live-inventory-settings">
<h2>Settings</h2>
<label>
<select id="live-inventory-settings--mode">
<option value="icon" ${settings.displayMode === 'icon' ? 'selected' : ''}>Key icon</option>
<option value="count" ${settings.displayMode === 'count' ? 'selected' : ''}>Number of keys</option>
<option value="marker" ${settings.displayMode === 'marker' ? 'selected' : ''}>Marker pin</option>
</select>
Display mode
</label>
<h3>Capsule names</h3>
<textarea id="live-inventory-settings--capsule-names" placeholder="CAPSULEID:Display name">${settings.capsuleNames || ''}</textarea>
</div>
</div>`,
			title: 'Key Inventory',
			id: 'live-inventory',
			width: 'auto',
			closeCallback: function () {
				settings.displayMode = $('#live-inventory-settings--mode').val();
				settings.capsuleNames = $('#live-inventory-settings--capsule-names').val();
				saveSettings();
				removeAllIcons();
				checkShowAllIcons();
			}
		}).dialog('option', 'buttons', {
			'Copy Items': exportItems,
			'Copy Keys': exportKeys,
			'Add Markers': addKeyMarkers,
			'OK': function () {
				$(this).dialog('close');
			},
		});

		$('#live-inventory-key-table th').click(function () {
			const orderBy = this.getAttribute('data-orderby');
			this.orderDirection = !this.orderDirection;
			updateKeyTableBody(orderBy, this.orderDirection);
		});

		$('#live-inventory-item-table th').click(function () {
			const orderBy = this.getAttribute('data-orderby');
			this.orderDirection = !this.orderDirection;
			updateItemTableBody(orderBy, this.orderDirection);
		});

	};

	function preparePortalKeyMap() {
		const keyMap = {};
		thisPlugin.keyCount.forEach((k) => {
			keyMap[k.portalCoupler.portalGuid] = k;
		});
		return keyMap;
	}

	function formatDistance(dist) {
		if (dist >= 10000) {
			dist = Math.round(dist / 1000) + 'km';
		} else if (dist >= 1000) {
			dist = Math.round(dist / 100) / 10 + 'km';
		} else {
			dist = Math.round(dist) + 'm';
		}

		return dist;
	}

	function updateDistances() {
		const center = window.map.getCenter();
		thisPlugin.keyCount.forEach((k) => {
			if (!k._latlng) {
				k._latlng = L.latLng.apply(L, k.portalCoupler.portalLocation.split(',').map(e => {
					return HexToSignedFloat(e);
				}));
			}
			k._distance = k._latlng.distanceTo(center);
			k._formattedDistance = formatDistance(k._distance);
		});
	}

	function prepareData(data) {
		thisPlugin.itemCount = prepareItemCounts(data);
		thisPlugin.keyCount = prepareKeyCounts(data);
		thisPlugin.keyMap = preparePortalKeyMap();
		updateDistances();
	}

	function loadInventory() {
		try {
			const localData = JSON.parse(localStorage[KEY_SETTINGS]);
			if (localData && localData.settings) {
				settings = localData.settings;
			}
			if (localData && localData.expires > Date.now() && localData.data) {
				prepareData(localData.data);
				return;
			}
		} catch (e) { }

		checkSubscription((err, data) => {
			if (data && data.result === true) {
				window.postAjax('getInventory', {
					"lastQueryTimestamp": 0
				}, (data, textStatus, jqXHR) => {
					localStorage[KEY_SETTINGS] = JSON.stringify({
						data: data,
						expires: Date.now() + 10 * 60 * 1000, // request data only once per five minutes, or we might hit a rate limit
						settings: settings
					});
					prepareData(data);
				}, (data, textStatus, jqXHR) => {
					console.error(data);
				});
			}
		});
	};

	function saveSettings() {
		const ls = {};
		try {
			const localData = JSON.parse(localStorage[KEY_SETTINGS]);
			ls.data = localData.data;
			ls.expires = localData.expires;
		} catch (e) { }
		ls.settings = settings;
		localStorage[KEY_SETTINGS] = JSON.stringify(ls);
	}

	function portalDetailsUpdated(p) {
		if (!thisPlugin.keyMap) {
			return;
		}
		const capsuleNames = parseCapsuleNames(settings.capsuleNames);
		const countData = thisPlugin.keyMap[p.guid];
		if (countData) {
			$(`<tr class="randdetails-keys"><td>${countData.count}</td><th>Keys</th><th>Capsules</th><td class="randdetails-capsules">${countData.capsules.map(e => capsuleNames[e] || e).join(', ')}</td></tr>`)
				.appendTo($('#randdetails tbody'));
		}
	}

	function addKeyToLayer(data) {
		const tileParams = window.getCurrentZoomTileParameters ? window.getCurrentZoomTileParameters() : window.getMapZoomTileParameters();
		if (tileParams.level !== 0) {
			return;
		}

		if (thisPlugin.keyMap && thisPlugin.keyMap[data.portal.options.guid] && !data.portal._keyMarker) {
			let icon = thisPlugin.keyIcon;
			if (settings.displayMode === 'count') {
				icon = new L.DivIcon({
					html: thisPlugin.keyMap[data.portal.options.guid].count,
					className: 'plugin-live-inventory-count'
				});
			}
			data.portal._keyMarker = L.marker(data.portal._latlng, {
				icon: icon,
				interactive: false,
				keyboard: false,
			}).addTo(thisPlugin.layerGroup);
		}
	}

	function removeKeyFromLayer(data) {
		if (data.portal._keyMarker) {
			thisPlugin.layerGroup.removeLayer(data.portal._keyMarker);
			delete data.portal._keyMarker;
		}
	}

	function removeAllIcons() {
		thisPlugin.layerGroup.clearLayers();
		for (let id in window.portals) {
			delete window.portals[id]._keyMarker;
		}
	}

	function checkShowAllIcons() {
		const tileParams = window.getCurrentZoomTileParameters ? window.getCurrentZoomTileParameters() : window.getMapZoomTileParameters();
		if (tileParams.level !== 0) {
			removeAllIcons();
		} else {
			for (let id in window.portals) {
				addKeyToLayer({
					portal: window.portals[id]
				});
			}
		}
	}

	function setup() {
		loadInventory();
		$('<a href="#">')
			.text('Keys')
			.click(displayInventory)
			.appendTo($('#toolbox'));

		$("<style>")
			.prop("type", "text/css")
			.html(`.plugin-live-inventory-count {
font-size: 10px;
color: #FFFFBB;
font-family: monospace;
text-align: center;
text-shadow: 0 0 1px black, 0 0 1em black, 0 0 0.2em black;
pointer-events: none;
-webkit-text-size-adjust:none;
}
#live-inventory th {
background-color: rgb(27, 65, 94);
cursor: pointer;
}
#live-inventory-settings {
margin-top: 2em;
}
#live-inventory-settings h2{
line-height: 2em;
}
#live-inventory-settings--capsule-names{
min-height: 200px;
min-width: 400px;
}
#randdetails td.randdetails-capsules {
white-space: normal;
}
#randdetails .randdetails-keys td,
#randdetails .randdetails-keys th {
vertical-align: top;
}
`)
			.appendTo("head");

		window.addHook('portalDetailsUpdated', portalDetailsUpdated);
		window.addHook('portalAdded', addKeyToLayer);
		window.addHook('portalRemoved', removeKeyFromLayer);
		window.map.on('zoom', checkShowAllIcons);
		window.map.on('moveend', updateDistances);
	}

	function delaySetup() {
		thisPlugin.layerGroup = new L.LayerGroup();
		window.addLayerGroup('Portal keys', thisPlugin.layerGroup, false);
		createIcons();

		setTimeout(setup, 1000); // delay setup and thus requesting data, or we might encounter a server error
	}
	delaySetup.info = plugin_info; //add the script info data to the function as a property

	if (window.iitcLoaded) {
		delaySetup();
	} else {
		if (!window.bootPlugins) {
			window.bootPlugins = [];
		}
		window.bootPlugins.push(delaySetup);
	}
}


(function () {
	const plugin_info = {};
	if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
		plugin_info.script = {
			version: GM_info.script.version,
			name: GM_info.script.name,
			description: GM_info.script.description
		};
	}
	// Greasemonkey. It will be quite hard to debug
	if (typeof unsafeWindow != 'undefined' || typeof GM_info == 'undefined' || GM_info.scriptHandler != 'Tampermonkey') {
		// inject code into site context
		const script = document.createElement('script');
		script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(plugin_info) + ');'));
		(document.body || document.head || document.documentElement).appendChild(script);
	} else {
		// Tampermonkey, run code directly
		wrapper(plugin_info);
	}
})();
