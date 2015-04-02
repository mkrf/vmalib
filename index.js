var fs = require('fs');
var request = require('request');
var xml2js = require('xml2js');
var parseXML = require('xml2js').parseString;

var auth = function(data, callback) {
	var jar = request.jar();
	var opts = {
		'url': 'http://dc.mkrf.ru/dcx_mkrf/atom',
		'jar': jar,
		'auth': {
			'user': data.user,
			'pass': data.pass,
			'sendImmediately': true
		}
	}

	request(opts, function(err, res, body) {
		var cookie = {
			'param': jar.getCookieString(opts.url),
			'url': opts.url
		};
		callback.call(null, null, cookie);
	});
}

var get_cookie = function(cookie) {
	var jar = request.jar();
	var param = request.cookie(cookie.param);
	jar.setCookie(param, cookie.url);

	return jar;
}

var parse_templ = function(templ, callback) {
	fs.readFile(__dirname + '/xml_templ/' + templ, 'utf-8', function(err, xml) {
		parseXML(xml, function(err, obj) {
			callback.call(null, null, obj);
		});
	});
}

var set_meta = function(meta, obj, callback) {
	for (var i in meta.head) {
		if (typeof meta.head[i] == 'string') {
			Object.defineProperty(obj['entry']['document'][0]['head'][0], i, {'value': [meta.head[i]], 'enumerable': true});
		} else if (Array.isArray(meta.head[i])) {
			Object.defineProperty(obj['entry']['document'][0]['head'][0], i, {'value': meta.head[i], 'enumerable': true});
		} else {
			var param = {};
			if (meta.head[i] && meta.head[i]['_']) {
				param['_'] = meta.head[i]['_'];
				delete meta.head[i]['_'];
			}
			param['$'] = meta.head[i];

			Object.defineProperty(obj['entry']['document'][0]['head'][0], i, {'value': [param], 'enumerable': true});
		}
	}

	if (meta.body) {
		var xml = '<body><p>' + meta.body.replace(/\<br \/\>/g, '</p><p>') + '</p></body>';
		parseXML(xml, function(err, body) {
			var $meta = obj['entry']['document'][0]['body'][0]['$'];
			Object.defineProperty(body['body'], '$', {'value': $meta, 'enumerable': true});
			obj['entry']['document'][0]['body'][0] = body;
		});
	}

	callback.call(null, null, obj);
}


var send_file = function (cookie, path, callback) {
	var count = 0;
	var jar = get_cookie(cookie);
	var opts = {
		'url': 'http://dc.mkrf.ru/dcx_mkrf/atom/upload/mkrf_uploadconfig_architecture_file',
		'jar': jar,
		'method': 'POST',
		'formData': {
			'file[input][]': fs.createReadStream(path)
		}
	}

	request(opts, function(err, res, body) {
		var location = res.caseless.dict.location;

		var check_load_interval = setInterval(function() {
			request({'url': location, 'jar': jar}, function(err, res, xml) {
				parseXML(xml, function(err, result) {
					var status = result.entry.job[0]['status'][0];
					if (status == 3) {
						clearInterval(check_load_interval);
						var image_id = result.entry.job[0]['objects'][0]['document'][0]['$']['id'];

						callback.call(null, null, image_id);
					} else {
						if (count < 30) {
							count++;
						} else {
							clearInterval(check_load_interval);
							callback.call(null, new Error('Image not load'));
						}
					}
				});
			});
		}, 4000);
	});
}


var get_document = function (cookie, id, callback) {
	var jar = get_cookie(cookie);

	var opts = {
		'url': 'http://dc.mkrf.ru/dcx_mkrf/atom/document/' + id,
		'jar': jar
	}

	request(opts, function(err, res, xml) {
		parseXML(xml, function(err, obj) {
			if (!obj) {
				callback.call(null, new Error('Not Document'));
			} else {
				callback.call(null, null, obj);
			}
		});
	});
}


var update_document = function (cookie, id, obj, callback) {
	var jar = get_cookie(cookie);
	var builder = new xml2js.Builder();

	var opts = {
		'url': 'http://dc.mkrf.ru/dcx_mkrf/atom/document/' + id,
		'jar': jar,
		'method': 'PUT',
		'headers': {
			'Content-Type': 'application/atom+xml;type=entry'
		},
		'form': builder.buildObject(obj)
	}

	request(opts, function(err, res, body) {
		callback.call(null, null, res);
	});
}

var create_document = function(cookie, meta, callback) {
	var jar = get_cookie(cookie);
	var builder = new xml2js.Builder();

	var opts = {
		'url': 'http://dc.mkrf.ru/dcx_mkrf/atom/documents/',
		'jar': jar,
		'method': 'POST',
		'headers': {
			'Content-Type': 'application/atom+xml;type=entry'
		},
		'form': null
	}

	parse_templ('create_document.xml', function(err, obj) {
		set_meta(meta, obj, function(err, obj) {
			opts['form'] = builder.buildObject(obj);

			request(opts, function(err, res, body) {
				var id = res.caseless.dict.location.split('/')[6];

				update_pub_info(cookie, id, 'pubtype-article', function(err, result) {
					update_status(cookie, id, 'taskstatus-done', function(err, result) {
						callback.call(null, null, id);
					});
				});
			});
		});
	});
}

var get_pub_info = function(cookie, id, callback) {
	var jar = get_cookie(cookie);
	var opts = {
		'url': 'http://dc.mkrf.ru/dcx_mkrf/atom/pubinfos?q[doc_id]=' + id,
		'jar': jar
	}

	request(opts, function(err, res, body) {
		callback.call(null, null, res);
	});
}

var update_pub_info = function(cookie, id, type, callback) {
	var jar = get_cookie(cookie);
	var builder = new xml2js.Builder();

	var opts = {
		'url': 'http://dc.mkrf.ru/dcx_mkrf/atom/pubinfos?q[doc_id]=' + id,
		'jar': jar,
		'method': 'POST',
		'headers': {
			'Content-Type': 'application/atom+xml;type=entry'
		},
		'form': null
	}

	parse_templ('update_pub_info.xml', function(err, obj) {
		Object.defineProperty(obj['entry']['pubinfo'][0]['type_id'][0], '$', {'value': {'id': type}, 'enumerable': true});

		opts['form'] = builder.buildObject(obj);

		request(opts, function(err, res, body) {
			callback.call(null, null, res);
		});
	});
}


var update_status = function(cookie, id, status, callback) {
	var jar = get_cookie(cookie);
	var builder = new xml2js.Builder();

	get_document(cookie, id, function(err, obj) {
		var status_id = obj['entry']['document'][0]['task'][0]['$']['href'].split('/')[4];

		get_document(cookie, status_id, function(err, obj) {
			Object.defineProperty(obj['entry']['document'][0]['head'][0]['TaskStatus'][0], '$', {'value': {'topic': status}, 'enumerable': true});

			update_document(cookie, status_id, obj, function(err, id) {
				callback(null, null, id);
			});
		});
	});
}

var document_to_story = function(cookie, doc_id, story_id, meta, callback) {
	var jar = get_cookie(cookie);
	var builder = new xml2js.Builder();

	var opts = {
		'url': 'http://dc.mkrf.ru/dcx_mkrf/atom/pubinfos',
		'jar': jar,
		'method': 'POST',
		'headers': {
			'Content-Type': 'application/atom+xml;type=entry'
		},
		'form': null
	}

	parse_templ('document_to_story.xml', function(err, obj) {

		Object.defineProperty(obj['entry']['pubinfo'][0]['doc_id'][0], '$', {'value': {'id': doc_id}, 'enumerable': true});
		Object.defineProperty(obj['entry']['pubinfo'][0]['story_doc_id'][0], '$', {'value': {'id': story_id}, 'enumerable': true});

		opts['form'] = builder.buildObject(obj);

		request(opts, function(err, res, body) {
			callback.call(null, null, res);
		});
	});
}


var upload_file = function(cookie, path, meta, callback) {
	send_file(cookie, path, function(err, id) {
		get_document(cookie, id, function(err, obj) {
			meta.head['ObjectName'] = 'Фотография';
			set_meta(meta, obj, function(err, obj) {
				update_document(cookie, id, obj, function(err, result) {
					update_pub_info(cookie, id, 'pubtype-image', function(err, result) {
						callback.call(null, null, id);
					});
				});
			});
		});
	});
}


module.exports = {
	auth: auth,
	set_meta: set_meta,
	parse_templ: parse_templ,
	send_file: send_file,
	document_to_story: document_to_story,
	get_document: get_document,
	update_document: update_document,
	create_document: create_document,
	get_pub_info: get_pub_info,
	update_pub_info: update_pub_info,
	upload_file: upload_file
}