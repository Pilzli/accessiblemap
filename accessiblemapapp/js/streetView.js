var lat, lon;
var candidatesForManualSearch = [];
var locatedWay, locatedWayId;
var locationManual = false;
var compassHeading;
var streetViewContent = new Array();
var wayVectors = [];
var alreadyPrintedPoisRight = new Array();
var alreadyPrintedPoisLeft = new Array();

function getGPSLocation() {
	var deferred = $.Deferred();
	var options = {
		enableHighAccuracy : true,
		timeout : 5000,
		maximumAge : 0
	};
	function success(pos) {
		var crd = pos.coords;
		lat = crd.latitude;
		lon = crd.longitude;
		locatedLat = lat;
		locatedLon = lon;

		locateStreet().done(function(foundWay){
			if(foundWay != "undefined"){
				locatedWay = foundWay;
				writeActualLocation(foundWay);
				deferred.resolve();
			}
			else{
				$('#locationOutput').html("Ihr Standort konnte nicht bestimmt werden, bitte geben Sie ihn manuell ein.");
				deferred.resolve();
			}
		});
	};
	function error(err) {
		alert('ERROR(' + err.code + '): ' + err.message);
	};
	navigator.geolocation.getCurrentPosition(success, error, options);
	return deferred;
}
function refreshStreetView(){
	getGPSLocation();
	var streetViewContent = [];
	$('#streetViewContentLeft').empty();
	$('#streetViewContentRight').empty();
	
	getStreetView();
}

function writeActualLocation(way){
	getAddressForLatLon().done(function(address){
		if((typeof address != "undefined") && (typeof way.way != "undefined")){
			locationManual = false;
			if(typeof address.postcode === "undefined"){
				address.postcode = "";
			}
			$('#locationOutput').html(getTypeOfWay(way.way.tags)+", <br>"+ address.postcode + " " +address.city );
		}
		else{
			 $('#locationOutput').html("Ihr Standort konnte nicht bestimmt werden, bitte geben Sie ihn manuell ein.");
		}
	});
}
function getAddressForLatLon() {
	var deferred = $.Deferred();
	$.ajax({
		type : 'GET',
		url : "http://nominatim.openstreetmap.org/reverse?format=json&lat="+lat+"&lon="+lon+"&zoom=18&addressdetails=1",
		dataType : 'jsonp',
		jsonp : 'json_callback',
		error : function(parameters) {
			console.error("error");
		},
		success : function(parameters) {
			deferred.resolve(parameters.address);
		},
	});
	return deferred;
}
function getManualLocation() {
	var streetInput = $('#street').val();
	var placeInput = $('#place').val();
	var plzInput = $('#plz').val();
	var numberInput = $('#number').val();

	getWayFromNominatim(streetInput, numberInput, plzInput, placeInput).done(function(data) {
		// has too many matches
		if (data.length > 10) {
			$('#dialog').dialog('close');
			$('#locationOutput').html("Die manuelle Suche hat zu viele Resultate erzielt, bitte genauere Angaben machen.");
		} else if (data == "") {
			$('#locationOutput').html("Die manuelle Suche hat kein Resultat erzielt");
			$('#dialog').dialog('close');
		
		} else {
			// show candidates
			$.mobile.changePage('#manualSelection', 'pop', false, true);
			
			var html = '<fieldset data-role="controlgroup" data-mini="true" id="locationResults">';
			$.each(data, function(index, candidate) {
				if (candidate.osm_type == "way") {
					candidatesForManualSearch.push(candidate);
					html += '<input type="radio" name="radioLocation" id="radio-mini-' + index + '" value="'
					+ candidate.osm_id + '" /><label for="radio-mini-' + index + '">' + candidate.display_name
					+ '</label>';
				}
			});
			$('#contentManualSelection').html(html + '</fieldset>');
			$('#contentManualSelection').trigger('create');
		}
	});
}

function setManualLocation() {
	var wayId = $("input[name=radioLocation]:checked").val();
	$.each(candidatesForManualSearch, function(index, candidate) {
		if (candidate.osm_id == wayId) {
			lat = candidate.lat;
			lon = candidate.lon;
			locatedWayId = wayId;
			searchOverpassForLocationCoords(lat, lon,'way["highway"]').done(function(matchingSegment){
				getWayInfoOverpass(locatedWayId).done(function(wayData, nodeData){
					var nodes = [];
					//get coordinates for nodeIds
					$.each(wayData[0].nodes, function(index, nodeId){
						var node = getNodeInfo(nodeId, nodeData);
						pointObj = new point(node.lat, node.lon);
						nodes.push(pointObj);
					});
					//set coordinates to startpoint
					lat = nodes[0].x;
					lon = nodes[0].y;
					locatedLat = lat;
					locatedLon = lon;
					
					var startNode = nodes[0];
					var endNode = nodes[1];
					var dist = calcDistance(startNode.x, startNode.y, endNode.x, endNode.y);
					var wayVec = new wayVector(wayData[0].id, nodes, wayData[0].tags);
					var distSeg = new distSegmentEntry(startNode.x,startNode.y, endNode.x, endNode.y,startNode.x,startNode.y, dist, wayData[0].id, wayVec);
					locatedWay = distSeg;
				
					$('#locationOutput').html(candidate.display_name);
					$.mobile.changePage($("#location"), "none");
					locationManual = true;
				});
			});
		}
	});
}
function getWayFromNominatim(street, number, plz, place) {
	var wayResults = [];
	var deferred = $.Deferred();
	$.ajax({
		type : 'GET',
		url : "http://nominatim.openstreetmap.org/search?q=" + street + "+" + "," + "+" + place
				+ "+"+"switzerland&format=json&polygon=1&addressdetails=1",
		dataType : 'jsonp',
		jsonp : 'json_callback',
		error : function(parameters) {
			console.error("error");
		},
		success : function(parameters) {
			// if there is more than one result
			var result;
			if (parameters.length > 1) {
				$.each(parameters, function(index, data) {
					//only ways
					if((data.osm_type == "way") &&(data.class == "highway")){
						// if postalcode matches, take it
						if(typeof plz != "undefined"){
							if (data.address.postcode == plz) {
								wayResults.push(data);
								deferred.resolve(wayResults);
							} else if(data.address.city == place){
								wayResults.push(data);
								deferred.resolve(wayResults);
							}else{
								wayResults.push(data);
							}
						}
					}
					if(index == (parameters.length-1)){
						deferred.resolve(wayResults);
					}
				});
			} else if (parameters.length == 1) {
				deferred.resolve(wayResults);
			} else {
				deferred.resolve("");
			}
		},
	});
	return deferred;
}

function getStreetView() {
	var startentry,endentry;
	var dist = calcDistance( locatedWay.startlat,  locatedWay.startlon,locatedWay.endLat,  locatedWay.endLon);
	startentry = new tempEntry("", dist,  locatedWay.startlat,  locatedWay.startlon, locatedWay.way);
	endentry = new tempEntry("", "",  locatedWay.endLat,  locatedWay.endLon, locatedWay.way);
	getStreetContent(startentry, endentry);
}

function getStreetContent(startentry,endentry){
	var streetArray = [];
	streetArray.push(startentry);
	streetArray.push(endentry);
	
	var intersections = findIntersections(wayVectors, lat, lon);
	var warnings = getIsecWarnings(wayVectors);
	
	enrichStreetWay(locatedWay, intersections, warnings, lat, lon).done(function(enrichedStreet){
		var selectedPois = getSelectedPois();
		var counter = selectedPois.length;
			
		checkCompass().done(function(compassvalue){
			if(selectedPois.length>0){
				$.each(selectedPois, function(index, poi){
					getPOIs(poi,compassvalue).done(function(){
						counter--;
						if(counter==0){
							streetViewContent.sort(distanceSort);
							writeStreetViewHTML(enrichedStreet,compassvalue);
							getSide(compassvalue, startentry, endentry, "streetView");
						}
					});
				});
			}else{
				writeStreetViewHTML(enrichedStreet,compassvalue);
				getSide(compassvalue, startentry, endentry, "streetView");
			}
		});
	});
}
function writeStreetViewHTML(enrichedStreet,compassvalue){
	var refreshButton = '<a href="#" data-icon="refresh" onClick="refreshStreetView();" data-role="button" >Ansicht aktualisieren</a>'
	
	var collapsibleSetLeft = '<div data-role="collapsible-set" data-theme="c" data-content-theme="d">';
	var opsCollapsibleLeft = '<div data-role="collapsible" data-mini="true"  data-collapsed-icon="arrow-r" data-expanded-icon="arrow-d"><h4>Orientierungspunkte</h4>'
		+'<h3>Vor Ihnen</h3><div id="inFrontLeft"><ul class="poi-list" id="frontleftlist"></ul></div>'
		+'<h3>Hinter Ihnen</h3><div id="inBackLeft"><ul class="poi-list" id="backleftlist"></ul></div></div>';
	var poiCollapsibleLeft = '<div data-role="collapsible" data-inset="false" data-mini="true" data-collapsed-icon="arrow-r" data-expanded-icon="arrow-d"><h4>POIs im Umkreis</h4><div id="aroundLeft"></div></div>';
	var collapsiblesLeft = opsCollapsibleLeft.concat(poiCollapsibleLeft);
	
	collapsibleSetLeft = collapsibleSetLeft.concat(collapsiblesLeft);
	collapsibleSetLeft = collapsibleSetLeft.concat('</div>');
	var htmlLeft = refreshButton;
	htmlLeft = htmlLeft.concat(collapsibleSetLeft);
	$('#streetViewContentLeft').html(htmlLeft);
	$('#aroundLeft').append(getPOISHTML("left"));
	$('#streetViewContentLeft').trigger('create');
	
	var collapsibleSetRight = '<div data-role="collapsible-set" data-theme="c" data-content-theme="d">';
	var opsCollapsibleRight = '<div data-role="collapsible" data-mini="true"  data-collapsed-icon="arrow-r" data-expanded-icon="arrow-d"><h4>Orientierungspunkte</h4>'+
								'<h3>Vor Ihnen</h3><div id="inFrontRight"><ul class="poi-list" id="frontrightlist"></ul></div>'+
								'<h3>Hinter Ihnen</h3><div id="inBackRight"><ul class="poi-list" id="backrightlist"></ul></div></div>';
	var poiCollapsibleRight = '<div data-role="collapsible" data-inset="false" data-mini="true" data-collapsed-icon="arrow-r" data-expanded-icon="arrow-d"><h4>POIs im Umkreis</h4><div id="aroundRight"></div></div>';
	var collapsiblesRight = opsCollapsibleRight.concat(poiCollapsibleRight);
	
	collapsibleSetRight = collapsibleSetRight.concat(collapsiblesRight);
	collapsibleSetRight = collapsibleSetRight.concat('</div>');
	var htmlRight = refreshButton;
	htmlRight = htmlRight.concat(collapsibleSetRight);
	$('#streetViewContentRight').html(htmlRight);
	$('#aroundRight').append(getPOISHTML("right"));
	$('#streetViewContentRight').trigger('create');

	printOPS(enrichedStreet,compassvalue);
	setListener();
	
}
function printOPS(finalroute,compval){
    var frontleftlist = $('#frontleftlist');
    var backleftlist = $('#backleftlist');
    var clock;
    var frontrightlist = $('#frontrightlist');
    var backrightlist = $('#backrightlist');
    $.each(finalroute, function(i, segment){
        $.each(segment.opsLeft, function(index, entry){
            clock = getClock(calcCompassBearing(entry.lat, entry.lon,locatedLat,locatedLon, compval));
            if((clock > 9)||(clock<3)) {
                frontleftlist.append("<li> " + getKindOfPoi(entry.keyword) + " in " + Math.round(entry.distance*1000) + " Meter");
                addIntersectionWaysText(frontleftlist, entry);
            }else{
                backleftlist.append("<li> " + getKindOfPoi(entry.keyword) + " in " + Math.round(entry.distance*1000) + " Meter");
                addIntersectionWaysText(backleftlist, entry);
            }
        });
        $.each(segment.opsRight, function(index, entry){
            clock = getClock(calcCompassBearing( entry.lat, entry.lon,locatedLat,locatedLon,compval));
            if((clock > 9)||(clock<3)) {
                frontrightlist.append("<li> " + getKindOfPoi(entry.keyword) + " in " + Math.round(entry.distance*1000) + " Meter");
                addIntersectionWaysText(frontrightlist, entry);
            }else{
                backrightlist.append("<li> " + getKindOfPoi(entry.keyword) + " in " + Math.round(entry.distance*1000) + " Meter");
                addIntersectionWaysText(backrightlist, entry);
            }
        });
    });
}
function getPOISHTML(side){
	var radioname, htmlAround;
	if(side == "left"){
		alreadyPrintedPoisLeft = [];
		radioname = "routeChoiceLeft";
		htmlAround = '<div data-role="fieldcontain" id="aroundLeftDiv"><fieldset data-role="controlgroup" >';
	}
	else{
		alreadyPrintedPoisRight = [];
		radioname = "routeChoiceRight";
		htmlAround = '<div data-role="fieldcontain" id="aroundRightDiv"><fieldset data-role="controlgroup" >';
	}
	
	$.each(streetViewContent, function(index, poi){
		var name = typeof poi.tags.name != "undefined" ? poi.tags.name : "";
		if((side == 'left') &&($.inArray(poi,alreadyPrintedPoisLeft)==-1)){
			alreadyPrintedPoisLeft.push(poi);
			htmlAround = htmlAround.concat('<input type="radio" data-mini="true" data-inline="true" class="radioelem"' +
					'name="'+radioname+'" id="'+poi.lat+","+poi.lon+'" value="' +poi.name.concat(" " +name)+' "  />' +
					'<label for="'+poi.lat+","+poi.lon+'" class="poi-label"> ' +
					poi.name+" "+name+" in "+poi.distance+" Meter auf "+poi.clock+" Uhr </label>");
		}else if($.inArray(poi, alreadyPrintedPoisRight)==-1){
			alreadyPrintedPoisRight.push(poi);
			htmlAround = htmlAround.concat('<input type="radio" data-mini="true"  data-inline="true" class="radioelem"' +
					'name="'+radioname+'" id="'+poi.lat+","+poi.lon+'" value="' +poi.name.concat(" " +name)+' "  />' +
					'<label for="'+poi.lat+","+poi.lon+'" class="poi-label"> ' +
					poi.name+" "+name+" in "+poi.distance+" Meter auf "+poi.clock+" Uhr</label>");
		}
		});
	htmlAround = htmlAround.concat('</fieldset></div>');
	return htmlAround;
}

function addIntersectionWaysText(textId, entry){
	if(entry.keyword==="intersection"){
		$(textId).append(" mit ");
		$.each(entry.tags, function(k, name){
			if(k===0){
				$(textId).append(name);
			}
			else if(k===entry.tags.length-1){
				$(textId).append(" und "+name+". ");
			}else{
				$(textId).append(", "+ name);
			}
		});
	}
}

function locateStreet(){
	var deferred = $.Deferred();
	searchOverpassForLocationCoords(lat, lon,'way["highway"]').done(function(matchingSegment){
		deferred.resolve(matchingSegment);
	});
	return deferred;
}
function getSelectedPois() {
	var selectedPOIs = [];
	$("input[type=checkbox]").each(function() {
		var name = $(this).attr('name');
		var id = $(this).attr('id');
		var saved = localStorage.getItem( $(this).attr('id'));
		if(saved === "true"){
			if(name !== "op"){
				selectedPOIs.push(id);
			}
		}
	});
	return selectedPOIs;
}

function getPOIs(keyWord,compassHeading) {
	streetViewContent = new Array();
	var deferred = $.Deferred();
	var radius = localStorage.getItem("radius");
	if(radius === null){
		radius = 500;
		localStorage.setItem("radius","500");
	}
	var bboxRadius = radius*1.5;
	var bbox = getBbox(lat, lon, bboxRadius);
	
	if(keyWord.indexOf("=")==-1){
		keyWord = "amenity="+keyWord;
	}
	$.ajax({
		type : 'GET',
		url : "http://overpass.osm.rambler.ru/cgi/interpreter?data=[out:json];node[" + keyWord + "](" + bbox[1] + "," + bbox[0] + ","
				+ bbox[3] + "," + bbox[2] + ");out;",
		dataType : 'json',
		jsonp : 'json_callback',
		error : function(parameters) {
			console.error("error");
		},
		success : function(parameters) {
			if(parameters.elements.length>0){
				$.each(parameters.elements, function(i, poi) {
					var distance = calcDistance(poi.lat, poi.lon, lat, lon);	
					distance = Math.round(1000 * distance);
					if (distance <= radius) {
						var name = getKindOfPoi(keyWord.split("=")[1]);
						var clock = getClock(calcCompassBearing(poi.lat,poi.lon,lat,lon, compassHeading));
						var entry = new streetViewEntry(poi.id, poi.lat, poi.lon, name, clock,distance,poi.tags);
						streetViewContent.push(entry);
					}
					if(i == (parameters.elements.length-1)){
						deferred.resolve();
					}
				});
			}else{
				deferred.resolve();
			}
		},
	});
	return deferred;
}

function alreadyFound(nodeid, found){
	var found = false;
	$.each(found, function(index, elem){
		if(elem.id == nodeid){
			found = true;
			return false;
		}
		if(index == (found.length-1)){
			return found;
		}
	});
}

function findWays(opWays, opNodes, lat, lon){
	$.each(opWays, function(i, overpassResult){
		var nodes = [];
		//get all nodes of way
		$.each(overpassResult.nodes, function(index, node){
			//get node info but not for the last
			var nodeInfo = getNodeInfo(node, opNodes);
			nodes.push(new point(nodeInfo.lat, nodeInfo.lon));
			//if all nodeinfo is here
			if(nodes.length === overpassResult.nodes.length){
				var wayVec = new wayVector(overpassResult.id, nodes, overpassResult.tags);
				wayVectors.push(wayVec);
			}
		});
	});
}

function findMatchingWay(lat,lon){
	var pointA, segStart, segEnd; 
	var smallestDist;
	var nearestSegment;
	var candidates = [];
	var nextNode;
	$.each(wayVectors, function(index, wayVec){
		//for each wayVec.nodes
		if(wayVec.nodes.length > 1){
			$.each(wayVec.nodes, function(i, node){
				//until secondlast
				if(i < (wayVec.nodes.length-1)){
					nextNode = wayVec.nodes[i+1];
					pointA = new point(lat,lon);
					segStart = new point(node.x, node.y);
					segEnd = new point(nextNode.x, nextNode.y);
					var distToSegmentResult = distToSegment(pointA,segStart,segEnd);
					nearestSegment = new distSegmentEntry(node.x, node.y,nextNode.x, nextNode.y,lat,lon, distToSegmentResult, wayVec.wayId, wayVec);
					candidates.push(nearestSegment);
				}
			});
		}else{
			if(index == wayVectors.length-1){
				return false;
			}
		}
	});
	
	if(candidates.length!==0){
		candidates.sort(distanceSort);
		return candidates[0];
	}else{
		return "undefined";
	}
}

function getNodeInfo(nodeId, allNodes) {
	var resultNode;
	$.each(allNodes, function(index, node){
		if(nodeId === node.id){
			resultNode = node;
		}
	});
	return resultNode;
}

function getSide(compass, startPoint, endPoint, page){
	var startBearing = calcBearing(lat, lon, startPoint.lat, startPoint.lon);
	var endBearing = calcBearing(lat, lon, endPoint.lat, endPoint.lon);
	
	if(startBearing>(compass-90)&&startBearing<(compass+90)){
		var temp = startPoint;
		startPoint = endPoint;
		endPoint = temp;
	}
	var bool = isLeft(startPoint.lat, startPoint.lon, endPoint.lat, endPoint.lon, lat, lon);
	if(page === "routing"){
		if(bool){
			$.mobile.changePage($("#routing"), "none");
		}else{
			$.mobile.changePage($("#routingRight"), "none");
		}
	}else{
		if(bool){
			$.mobile.changePage($("#streetViewLeft"), "none");
		}else{
			$.mobile.changePage($("#streetViewRight"), "none");
		}
	}
}

function findIntersections(wayVectors,lat,lon) {
	var intersections = [];
	var isec;
	$.each(wayVectors, function(i, element){
		if(element.wayId!==locatedWay.wayId){
			isec = getIntersection(element.nodes,locatedWay);
			if (isec != -1) {
				var intersectionEntry = new intersection(isec.x, isec.y, element.tags, locatedWay.way.tags, "intersection", element.wayId, locatedWay.wayId );
				var alreadyIn = isAlreadyInIntersections(intersectionEntry, intersections);
				if (alreadyIn === -1) {
					intersections.push(intersectionEntry);
				}
				else{
					intersections = addIsecWay(intersectionEntry, intersections, alreadyIn);
				}
			}
		}
	});
	//delete double names
	$.each(intersections, function(index, isec){
		var endtags = [];
		$.each(isec.tags, function(i, wayName){
			if($.inArray(wayName, isec.tags)===i){
				endtags.push(wayName);
			}
		});
		isec.tags= endtags;
	});
	return intersections;
}

function addIsecWay(isecEntry, intersections, index){
	var newIntersections = [];
	newIntersections = newIntersections.concat(intersections);
	
	for(var k=0; k<intersections[index].wayIds.length;k++){
		if(isecEntry.wayIds[0]!==intersections[index].wayIds[k]){
			newIntersections[index].wayIds.push(isecEntry.wayIds[0]);
			newIntersections[index].tags.push(isecEntry.tags[0]);
			break;
		}else if(isecEntry.wayIds[1]!==intersections[index].wayIds[k]){
			newIntersections[index].wayIds.push(isecEntry.wayIds[1]);
			newIntersections[index].tags.push(isecEntry.tags[1]);
			break;
		}
	}
	return newIntersections;
}
function getIntersection(nodeArray, way) {
	var isec = -1;
	$.each(nodeArray, function(index, node){
		$.each(way.way.nodes, function(i, wayNode){
			if ((node.x === wayNode.x) && (node.y === wayNode.y)||(node.x === wayNode.x) && (node.y === wayNode.y)) {
				isec = node;
			}
		});
	});
	return isec;
}
function isAlreadyInIntersections(intersection, intersections) {
	var alreadyIn = -1;
	$.each(intersections, function(i, isec){
		if ((isec.lat === intersection.lat) && (isec.lon === intersection.lon)){
			alreadyIn = i;	
		}
	});
	return alreadyIn;
}

function getIsecWarnings(paths){
	var warnings = [];
	$.each(paths, function(index, way){
		if((way.tags.bridge!=="yes")&&(way.tags.tunnel!=="yes")){
			for(var i=index+1; i<paths.length; i++){
				var nextWay = paths[i];
				if((nextWay.tags.bridge!=="yes")&&(nextWay.tags.tunnel!=="yes")){
					var warning = testOverlap(way, nextWay);
					$.each(warning, function(index, warn){
						warnings.push(warn);
					});
				}
			}
		}
	});
	return warnings;
}

function testOverlap(wayA, wayB){
	var warnings = [];
	for(var i=0; i<wayA.nodes.length-1; i++){
		for(var k=0;k<wayB.nodes.length-1; k++){
			var line1Start = wayA.nodes[i];
			var line1End = wayA.nodes[i+1];
			var line2Start = wayB.nodes[k];
			var line2End = wayB.nodes[k+1];
			
			var warning = getOverlaps(line1Start.x,line1Start.y,line1End.x, line1End.y,line2Start.x,line2Start.y,line2End.x,line2End.y);
			if(warning!==null){
				warnings.push(new intersection(warning.x, warning.y, wayA.tags, wayB.tags, "warning", wayA.wayId,wayB.wayId));
			}
		}
	}
	return warnings;
}

function getOverlaps(x1,y1,x2,y2, x3,y3,x4,y4){
	var ux = x2-x1;
	var uy = y2-y1;
	var vx = x4-x3;
	var vy = y4-y3;
	var discriminant = ux*vy-uy*vx;
	
	if(discriminant!=0){
		var wx = x1-x3;
		var wy = y1-y3;
		var w2x = x2-x3;
		var w2y = y2-y3;
		var t0, t1;
		var numerator1 = vx*wy-vy*wx;
		var numerator2 = ux*wy-uy*wx;
		
		wy = numerator1/discriminant;
		wx = numerator2/discriminant;
		
		if((wy>0 && wy<1)&&(wx>0 && wx<1)){
			var isecX = (parseFloat(x1)+wy*ux);
			var isecY = (parseFloat(y1)+wy*uy);
			//if not a shared node
			if(!((x1==x3 && y1==y3)||(x1==x4 && y1==y4)||(x2==x3 && y2==y3)||(x2==x4 && y2==y4))){
				isecX = Math.round(isecX * 10000000) / 10000000;
				isecY = Math.round(isecY * 10000000) / 10000000;
				return new point(isecX, isecY);
			}
		}
	}
	return null;
}