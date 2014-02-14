module.exports = function livemodify(opt) {
  // options
  var opt = opt || {};
  var ignore = opt.ignore || opt.excludeList || ['.js', '.css', '.svg', '.ico', '.woff', '.png', '.jpg', '.jpeg'];
  var html = opt.html || _html;
  var rules = opt.rules || [{
    match: /<%@/,
    fn: prepend
  }, {
    match: /<\/html>/,
    fn: prepend
  }, {
    match: /<\!DOCTYPE.+>/,
    fn: append
  }];
  var src = opt.src;

  var snippet = '';

  var js = opt.js || [];
  var css = opt.css || [];

  js.forEach(function(item){
    snippet+= "\n<script type=\"text/javascript\">document.write('<script src=\"" + item + "\" type=\"text/javascript\"><\\/script>')</script>\n";
  });

  css.forEach(function(item){
    snippet+= "\n<link rel=\"stylesheet\" href=\"" + item + "\">";
  });

  // helper functions
  var regex = (function() {
    var matches = rules.map(function(item) {
      return item.match.source;
    }).join('|');

    return new RegExp(matches);
  })();

  function prepend(w, s) {
    return s + w;
  }

  function append(w, s) {
    return w + s;
  }

  function _html(str) {
    if (!str) return false;
    return /<[:_-\w\s\!\/\=\"\']+>/i.test(str);
  }

  function exists(body) {
    if (!body) return false;
    return regex.test(body);
  }

  function snip(body) {
    if (!body) return false;
    return (~body.lastIndexOf(snippet));
  }

  function snap(body) {
    var _body = body;
    rules.some(function(rule) {
      if (rule.match.test(body)) {
        _body = body.replace(rule.match, function(w) {
          return rule.fn(w, snippet);
        });
        return true;
      }
      return false;
    });
    return _body;
  }

  function accept(req) {
    var ha = req.headers["accept"];
    if (!ha) return false;
    return (~ha.indexOf("html"));
  }

  function leave(req) {
    var url = req.url;
    var ignored = false;
    if (!url) return true;
    ignore.forEach(function(item) {
      if (~url.indexOf(item)) {
        ignored = true;
      }
    });
    return ignored;
  }

  // middleware
  return function livemodify(req, res, next) {
    if (res._livemodify) return next();
    res._livemodify = true;

    var writeHead = res.writeHead;
    var write = res.write;
    var end = res.end;

    if (!accept(req) || leave(req)) {
      return next();
    }


    function restore() {
      res.writeHead = writeHead;
      res.write = write;
      res.end = end;
    }

    res.push = function(chunk) {
      res.data = (res.data || '') + chunk;
    };

    res.inject = res.write = function(string, encoding) {
      console.log("WRITING");
      if (string !== undefined) {
        var body = string instanceof Buffer ? string.toString(encoding) : string;
        // console.log(body);
        if (exists(body) && !snip(res.data)) {
          console.log("HIT 1");
          res.push(snap(body));
          return true;
        } else if (html(body) || html(res.data)) {
          console.log("HIT 2");
          // res.push(body);
          return true;
        } else {
          console.log("HIT 3");
          restore();
          return write.call(res, string, encoding);
        }
      }
      return true;
    };

    res.writeHead = function() {
      var headers = arguments[arguments.length - 1];
      if (headers && typeof headers === 'object') {
        for (var name in headers) {
          if (/content-length/i.test(name)) {
            delete headers[name];
          }
        }
      }

      var header = res.getHeader( 'content-length' );
      if ( header ) res.removeHeader( 'content-length' );

      writeHead.apply(res, arguments);
    };

    res.end = function(string, encoding) {
      restore();
      var result = res.inject(string, encoding);
      if (!result) return end.call(res, string, encoding);
      if (res.data !== undefined && !res._header) res.setHeader('content-length', Buffer.byteLength(res.data, encoding));
      res.end(res.data, encoding);
    };
    next();
  };

}
