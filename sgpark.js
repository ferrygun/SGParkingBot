//Dialogflow: SGParking
//sgmrtarrivaltime@gmail.com 
//sgparking-195907
//https://sgparking-195907.appspot.com/webhook/

'use strict'
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const zlib = require('zlib');
const app = express();
const moment = require('moment');
const querystring = require('querystring');
const jwtDecode = require('jwt-decode');
const token = '';
const fs = require("fs");
const path = require("path");

const chunk_size = 10;
let groups;

const distancemax = 170;
let lat = 0;
let long = 0;
let userlat = 0;
let userlong = 0;
let array_item = [];
let arrayData = [];
let baseurl = 'https://sgparking.herokuapp.com/';
let vehicletype = 0;

function toRad(deg) {
    return deg * Math.PI / 180;
}

function distance(lat1, lng1, lat2, lng2) {
    var R = 6371e3;
    var φ1 = toRad(lat1);
    var φ2 = toRad(lat2);
    var Δφ = toRad(lat2 - lat1);
    var Δλ = toRad(lng2 - lng1);

    var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;

    return d;
}

function sleep(milliseconds) {
  var start = new Date().getTime();
  for (var z = 0; z < 1e7; z++) {
    if ((new Date().getTime() - start) > milliseconds){
      break;
    }
  }
}

function getProfile(id, cb){
	request({
      method: 'GET',
       uri: `https://graph.facebook.com/v2.6/${id}`,
      qs: _getQs({fields: 'first_name,last_name,profile_pic,locale,timezone,gender'}),
      json: true
    }, function(error, response, body) {
      if (error) return cb(error)
      if (body.error) return cb(body.error)

      cb(body)
    })
}

function _getQs (qs) {
    if (typeof qs === 'undefined') {
      qs = {}
    }
    qs['access_token'] = token

	return qs
}

function sendTextMessages(sender, text, i) {
    if (i < text.length) {
        request({
            url: 'https://graph.facebook.com/v2.6/me/messages',
            qs: {access_token: token},
            method: 'POST',
            json: {
                recipient: {id:sender},
                message: {text:text[i]},
            }
        }, function(error, response, body) {
            if (error) {
                console.log('Error sending messages: ', error)
            } else if (response.body.error) {
                console.log('Error: ', response.body.error)
            }
            sendTextMessages(sender, text, i+1);
			sleep(1000);
        })
    } else {
		sendLocation(sender, function(returnValue) {
		});
		return;
	}
}

function sendTextMessage(sender, text, cb) {
    let messageData = { text:text }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
		cb();
    })
}

function sendMsg(data, sender, cb) {
	request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
         json: {
			recipient: { id: sender },
			message:{
				attachment: {
				  type: 'template',
				  payload: {
					  template_type: 'generic',
					  elements: data
				  }
				}
			}
		}
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        } else 
        	cb();
    })
}

function getCarPark(callback) {
	let usertime = moment().format();

	let startdate = moment();
	startdate = startdate.subtract(7, "days");
	startdate = require('querystring').escape(startdate.format());

	let headers = {
		'accept': 'application/json, text/plain, */*',
		'streetsmart-brand': 'samsung',
		'streetsmart-model': 'SM-G610F',
		'streetsmart-system-version': '7.0',
		'streetsmart-build-number': '14',
		'streetsmart-binary-version': '2.3.0',
		'streetsmart-display-version': 'v2.4.6',
		'streetsmart-user-agent': 'Dalvik/2.1.0 (Linux; U; Android 7.0; SM-G610F Build/NRD90M)',
        'streetsmart-timezone': 'Asia/Singapore',
		'streetsmart-user-time': usertime,
		'accept-encoding': 'gzip',
		'user-agent': 'okhttp/3.4.1',
    }

    let options = {
        url: 'https://api.parking.sg/v1/carparks?last_update_timestamp=' + startdate,
        method: 'GET',
        headers: headers
    }
    //console.log(options);


    let requestWithEncoding = function(options, callback) {
        let req = request.get(options);

        req.on('response', function(res) {
            let chunks = [];
            res.on('data', function(chunk) {
                chunks.push(chunk);
            });

            res.on('end', function() {
                let buffer = Buffer.concat(chunks);
                let encoding = res.headers['content-encoding'];
                if (encoding == 'gzip') {
                    zlib.gunzip(buffer, function(err, decoded) {
                        callback(err, decoded && decoded.toString());
                    });
                } else if (encoding == 'deflate') {
                    zlib.inflate(buffer, function(err, decoded) {
                        callback(err, decoded && decoded.toString());
                    })
                } else {
                    callback(null, buffer.toString());
                }
            });
        });

        req.on('error', function(err) {
            callback(err);
        });
    }

    requestWithEncoding(options, function(err, data) {
        if (err) {
			console.log('requestToken err:' + err);
			callback('error');
		}
        else {
			//console.log(data);
			callback(data);
		}
    })
}

function getNewParkingOffer(carparklabel, vehicletype, duration, callback) {
	//vehicle_type: car, motorcycle, motorcycle_2x, heavy_vehicle_le_1800_kg, heavy_vehicle_gt_1800_kg
	if(vehicletype == 0)
		vehicletype = 'car';
	else if(vehicletype == 1)
		vehicletype = 'motorcycle';
	else if(vehicletype == 2)
		vehicletype = 'motorcycle_2x';
	else if(vehicletype == 3)
		vehicletype = 'heavy_vehicle_le_1800_kg';
	else if(vehicletype == 4)
		vehicletype = 'heavy_vehicle_gt_1800_kg';
	else
		vehicletype = '';

	if(carparklabel != '' && vehicletype != '' && duration >= 30) {
		let formData = '{"carpark_label":"' + carparklabel + '","vehicle_number":"EH2233E","vehicle_type":"' + vehicletype + '","duration":' + duration + '}';
		let contentLength = formData.length;
		
		let usertime = moment().format();

		let headers = {
			'accept': 'application/json, text/plain, */*',
			'streetsmart-brand': 'samsung',
			'streetsmart-model': 'SM-G610F',
			'streetsmart-system-version': '7.0',
			'streetsmart-build-number': '14',
			'streetsmart-binary-version': '2.3.0',
			'streetsmart-display-version': 'v2.4.6',
			'streetsmart-user-agent': 'Dalvik/2.1.0 (Linux; U; Android 7.0; SM-G610F Build/NRD90M)',
			'streetsmart-timezone': 'Asia/Singapore',
			'streetsmart-user-time': usertime,
			'content-type': 'application/json;charset=utf-8',
			'content-length': contentLength,
			'accept-encoding': 'gzip',
			'user-agent': 'okhttp/3.4.1',
		}

		let options = {
			url: 'https://api.parking.sg/v1/parkings/offer/start',
			method: 'POST',
			headers: headers,
			body: formData,
		}
		//console.log(options);

		let requestWithEncoding = function(options, callback) {
			let req = request.post(options);

			req.on('response', function(res) {
				let chunks = [];
				res.on('data', function(chunk) {
					chunks.push(chunk);
				});

				res.on('end', function() {
					let buffer = Buffer.concat(chunks);
					let encoding = res.headers['content-encoding'];
					if (encoding == 'gzip') {
						zlib.gunzip(buffer, function(err, decoded) {
							callback(err, decoded && decoded.toString());
						});
					} else if (encoding == 'deflate') {
						zlib.inflate(buffer, function(err, decoded) {
							callback(err, decoded && decoded.toString());
						})
					} else {
						callback(null, buffer.toString());
					}
				});
			});

			req.on('error', function(err) {
				callback(err);
			});
		}

		requestWithEncoding(options, function(err, data) {
			if (err) {
				console.log('err:' + err);
				callback('error');
			}
			else {
				//console.log(data);
				callback(data);
			}
		})
	} else
		callback('error');
}

function VehicleType(sender, label, cb) {
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message:{
				text: 'Vehicle type?',
				quick_replies: [{
					content_type: 'text',
					title: '🚗 Car',
					payload: 'VT_CAR_' + label
				},{
					content_type: 'text',
					title: '🏍️ Motorcycle',
					payload: 'VT_MOTORCYCLE_' + label
				},{
					content_type: 'text',
					title: '🏍️ Motorcycle with 2 Lots',
					payload: 'VT_MOTORCYCLE2_' + label
				},{
					content_type: 'text',
					title: '🚙 Light Goods Vehicle',
					payload: 'VT_LGV_' + label
				},{
					content_type: 'text',
					title: '🚙 Heavy Vehicle',
					payload: 'VT_HV_' + label
				}]
			}
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        } else
			cb();
    })
}

function Howlong(sender, label, vehicletype, cb) {
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message:{
				text: 'For how long?',
				quick_replies: [{
					content_type: 'text',
					title: '30mins',
					payload: 'HL_0_' + label + '_' + vehicletype
				},{
					content_type: 'text',
					title: '1hr',
					payload: 'HL_1_' + label + '_' + vehicletype
				},{
					content_type: 'text',
					title: '1.5hrs',
					payload: 'HL_2_' + label + '_' + vehicletype
				},{
					content_type: 'text',
					title: '2hrs',
					payload: 'HL_3_' + label + '_' + vehicletype
				},{
					content_type: 'text',
					title: '2.5hrs',
					payload: 'HL_4_' + label + '_' + vehicletype
				},{
					content_type: 'text',
					title: '3hrs',
					payload: 'HL_5_' + label + '_' + vehicletype
				},{
					content_type: 'text',
					title: '3.5hrs',
					payload: 'HL_6_' + label + '_' + vehicletype
				},{
					content_type: 'text',
					title: '4hrs',
					payload: 'HL_7_' + label + '_' + vehicletype
				},{
					content_type: 'text',
					title: '4.5hrs',
					payload: 'HL_8_' + label + '_' + vehicletype
				},{
					content_type: 'text',
					title: '5hrs',
					payload: 'HL_9_' + label + '_' + vehicletype
				},{
					content_type: 'text',
					title: '5.5hrs',
					payload: 'HL_10_' + label + '_' + vehicletype
				}]
			}
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        } else
			cb();
    })
}

function sendLocation(sender, cb) {
  	request({
		url: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {access_token:token},
		method: 'POST',
		json: {
			recipient: {id:sender},
			message:{
				text: 'Send location',
				quick_replies: [{
					content_type: 'location'
				}]
			}
		}
	}, function(error, response, body) {
		if (error) {
			console.log('Error sending messages: ', error)
		} else if (response.body.error) {
			console.log('Error: ', response.body.error)
		} else 
			cb();
	})
}

function init() {
	/*
	getCarPark(function (returnValue) {
		returnValue = JSON.parse(returnValue);
		let Distance = 0;
		userlat = 1.297882;
		userlong = 103.798058;

		if(typeof returnValue.carparks != 'undefined') {
			for(let i=0; i<returnValue.carparks.length; i++) {

				//console.log(returnValue.carparks[i].agency);
				for(let j=0; j<returnValue.carparks[i].location.length; j++) {
					lat = returnValue.carparks[i].location[j].latitude;
					long = returnValue.carparks[i].location[j].longitude

					
					Distance = distance(lat, long, userlat, userlong);
					if (Distance <= distancemax) {
						console.log(returnValue.carparks[i]);
					}
				}
			}
		}
	});
	*/
	

	getNewParkingOffer('QXTHM', 4, 30, function (returnValue) {
		if(returnValue != 'error') {
			let returnValue_ = returnValue;
			//console.log(returnValue);

			returnValue = JSON.parse(returnValue);
			
			if(typeof returnValue.status == 'undefined' && typeof returnValue.message == 'undefined') {
				let decoded = JSON.parse(JSON.stringify(jwtDecode(returnValue_)));
				console.log(decoded);
			} else
				console.log(returnValue.message);
				
		} else
			console.log('something error');
		
	});
}


function MainProgram() {
	app.set('port', (process.env.PORT || 5000))
	app.use(bodyParser.urlencoded({extended: false}))
	app.use(bodyParser.json())


	app.get('/sgparking/map/', function (req, res) {
		let lat = req.query.lat; 
		let long = req.query.long;


		fs.readFile(path.join(__dirname+'/html/parkingmap.html'), 'utf8', function (err, data) {
			data = data.toString().replace('STARTLAT', lat);
			data = data.toString().replace('STARTLNG', long);

			res.writeHead(200, {'Content-Type': 'text/html'});
			res.write(data);
			res.end();
		});
	})

	// for Facebook verification
	app.get('/webhook/', function (req, res) {
		if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
			res.send(req.query['hub.challenge'])
		}
		res.send('Error, wrong token')
	})

	app.post('/webhook/', function (req, res) {
		let messaging_events = req.body.entry[0].messaging
		for (let i = 0; i < messaging_events.length; i++) {
			let event = req.body.entry[0].messaging[i]
			let sender = event.sender.id
			array_item = [];

			if (event.postback) {
				let text = JSON.parse(JSON.stringify(event.postback));
				if(text.payload == 'USER_DEFINED_PAYLOAD') {
					getProfile(sender, function(returnValue) {
						let fname = returnValue.first_name;
						array_item = [
							"Hi " + fname +", I am SGParking Bot",
							"You can ask me the nearby carpark location and I can calculate the total cost based on the type of vehicle & duration.",
						];
						sendTextMessages(sender, array_item, 0);
					});					
				} else if(text.payload == 'SHARE_PAYLOAD') {
					array_item = [];
					array_item.push({
						"title": "Meet SGParking Bot", 
						"subtitle": "Want to search nearby carpark ? Just tell me where and I can tell you the total cost based on the type of vehicle & duration.",
						"buttons":[{
							"type":"element_share"
						}]
					});
					sendMsg(array_item, sender, function(returnValue) {
					});
				} else if(text.payload.split('-')[0] == 'CP') { //***2
					VehicleType(sender, text.payload.split('-')[1], function(returnValue) {
					});
				} 
			}

			if (event.message && event.message.hasOwnProperty('attachments')) { //***1
				if(event.message.attachments[0].payload.hasOwnProperty('coordinates')) {
					userlat = event.message.attachments[0].payload.coordinates.lat;
					userlong = event.message.attachments[0].payload.coordinates.long;

					console.log('userlat: ' + userlat + ', userlong: ' + userlong);
					getCarPark(function(returnValue) {
						returnValue = JSON.parse(returnValue);
						let Distance = 0;
						//console.log(returnValue);

						if(typeof returnValue.carparks != 'undefined') {
							for(let i=0; i<returnValue.carparks.length; i++) {

								for(let j=0; j<returnValue.carparks[i].location.length; j++) {
									lat = returnValue.carparks[i].location[j].latitude;
									long = returnValue.carparks[i].location[j].longitude
									
									Distance = distance(lat, long, userlat, userlong);
									if (Distance <= distancemax) {
										console.log(returnValue.carparks[i]);

										if(returnValue.carparks[i].status == 'active')
											arrayData.push({
												'title': returnValue.carparks[i].label,
												'subtitle': returnValue.carparks[i].name,
												'image_url': 'http://duocompass.com/img_sgparking/sgparking.png',
												'buttons':[{
													'type': 'postback',
													'title': 'Choose',
													'payload': 'CP-' + returnValue.carparks[i].label
													},{
													'type': 'web_url',
													'url': baseurl + '/sgparking/map/?lat=' + lat + '&long=' + long,
													'title': 'Get there'
													}
												]
											});
									}
								}
							}

							if (arrayData.length > 0) {
								sendTextMessage(sender, 'Showing the result...', function(returnValue) {
									groups = arrayData.map( function(e,i){ 
										return i%chunk_size===0 ? arrayData.slice(i,i+chunk_size) : null; 
									})
									.filter(function(e){ return e; });
										for (let p=0; p<groups.length; p++){
										sendMsg(groups[p], sender, function(returnValue) {
										});
									}
								});
							}
							else 
								sendTextMessages(sender, 'There is no nearby carpark at this location.', false, 0);
						}
					});

				}
			} else if (event.message && event.message.hasOwnProperty('quick_reply')) { //***3
				if(event.message.quick_reply.payload.split('_')[0] == 'VT') {
					if(event.message.quick_reply.payload.split('_')[1] == 'CAR') 
						vehicletype = 0;
					else if(event.message.quick_reply.payload.split('_')[1] == 'MOTORCYCLE') 
						vehicletype = 1;
					else if(event.message.quick_reply.payload.split('_')[1] == 'MOTORCYCLE2') 
						vehicletype = 2;
					else if(event.message.quick_reply.payload.split('_')[1] == 'LGV') 
						vehicletype = 3;
					else if(event.message.quick_reply.payload.split('_')[1] == 'HV') 
						vehicletype = 4;

					Howlong(sender, event.message.quick_reply.payload.split('_')[2], vehicletype, function (returnValue) {
					});
				}
				else if(event.message.quick_reply.payload.split('_')[0] == 'HL') { //***4
					//HL_0_' + label + '_' + vehicletype
					let label = event.message.quick_reply.payload.split('_')[2];
					let vehicletype = event.message.quick_reply.payload.split('_')[3];
					let duration = event.message.quick_reply.payload.split('_')[1];

					if(duration == 0)
						duration = 30;
					else if(duration == 1)
						duration = 60;
					else if(duration == 2)
						duration = 90;
					else if(duration == 3)
						duration = 120;
					else if(duration == 4)
						duration = 150;
					else if(duration == 5)
						duration = 180;
					else if(duration == 6)
						duration = 210;
					else if(duration == 7)
						duration = 240;
					else if(duration == 8)
						duration = 270;
					else if(duration == 9)
						duration = 300;
					else if(duration == 10)
						duration = 330;

					getNewParkingOffer(label, vehicletype, duration, function (returnValue) {
						if(returnValue != 'error') {
							let returnValue_ = returnValue;
							//console.log(returnValue);
							returnValue = JSON.parse(returnValue);							
							if(typeof returnValue.status == 'undefined' && typeof returnValue.message == 'undefined') {
								let decoded = JSON.parse(JSON.stringify(jwtDecode(returnValue_)));
								console.log(decoded);

								let date = decoded.session_end_time;
								let enddate = date.split('T')[0];
								enddate = enddate.substring(0, 10);
								let endtime = date.split('T')[1];
								endtime = endtime.substring(0, 8);

								let today = new Date();
								let dd = today.getDate();
								let mm = today.getMonth()+1; 
								let yyyy = today.getFullYear();
								if(dd < 10)
									dd='0'+dd;
								if(mm < 10)
									mm='0'+mm;
								today = yyyy+'-'+mm+'-'+dd;

								if(today == enddate)
									enddate = 'today';
								else {
									dd = enddate.split('-')[2];
									mm = enddate.split('-')[1];
									yyyy = enddate.split('-')[0];
									enddate = dd + '-' + mm + '-' + yyyy;
								}

								sendTextMessage(sender, 'Total cost: $' + decoded.session_cost/100 + '. Session ends: ' + enddate + ' ' + endtime, function(returnValue) {
								});
							} else {
								console.log(returnValue);
								sendTextMessage(sender, returnValue.message, function(returnValue) {
								});
							}
						} else
							console.log('something error');
						
					});
				}
			} else if (event.message && event.message.text) {
				let text = event.message.text;
				console.log(text);
				VehicleType(sender, text.trim().toUpperCase(), function(returnValue) {
				});
			}
			
		}
		res.sendStatus(200)
	})

	app.listen(app.get('port'), function() {
		console.log('SGParkingFB: App running on port', app.get('port'))
	})
}

//init();
MainProgram();
