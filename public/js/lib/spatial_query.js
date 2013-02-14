/*
 Spatial Query - a JQuery like Javascript library for handling spatial maths
 Copyright (c) 2009 Chris Zelenak
 Spatial Query is freely distributable under the MIT X11 License - see LICENSE file.

 A set of functions for initializing array data into spatial objects
 (matrix, vectors, polygons and latitude / longitude points) from which
 further operations may be made.

 Most vector and matrix operations support calculations to any dimension size.
 In cases where they are not supported, one of the two following cases will arise:

 * The function will be named <name>_2d or <name>_3d to indicate what dimension
   the operated data should be in

 * The function will throw an error stating that the general case solution has not
   been implemented yet. (Matrix inversion, for example)

 Examples:

 Return a vector at point x:10, y:0, z: 40.

 $v([10, 0, 40])


 Return a 5 element vector:

 $v([10, 0, 40, 21, 32])


 Take the vector at x:10, y:20 and project it on the
 vector at x:30 y:50, then return the magnitude of that
 vector.

 $v([10, 20]).project_on([30, 50]).magnitude();


 Take the latitude / longitude pair for Indianapolis and convert
 it into cartesian (WSG84) coordinates

 $ll([39.7670, -86.1563]).vector()


 The same as above, but roundtrip convert it back to latitude / longitude.

 $ll([39.7670, -86.1563]).vector().latlng()


 Generate a polygon

 $p([[0,0], [0, 10], [10, 10], [10, 0]])


 Compute the area of the polygon

 $p([[0,0], [0, 10], [10, 10], [10, 0]]).area_2d()


 Compute the centroid point (vector) of the polygon

 $p([[0,0], [0, 10], [10, 10], [10, 0]]).centroid_2d()


 Compute the convex hull of the polygon

 $p([[0,0], [0, 10], [10, 10], [10, 0]]).convex_hull_2d()


 Compute the union of the given polygon with another polygon

 $p([[0,0], [0, 10], [10, 10], [10, 0]]).union_2d([[5,5], [5, 7], [15, 7], [15, 5]])



 Vector:  $v([x, y, z, t, etc])
   -vector() -> Vector
   -latlng() -> LatLng, Convert to Latitude and Longitude
   -matrix() -> Matrix
   -add(other_vector_or_scalar) -> Vector
   -subtract(other_vector_or_scalar) -> Vector
   -multiply(other_vector_or_scalar) -> Vector
   -dot_product(other_vector) -> Number
   -cross_product(other_vector) -> Vector if dimension greater than 2, Number if dimension == 2
   -distance(other_vector) -> Number
   -midpoint_2d(other_vector) -> Vector
   -distance_2d_fast(other_vector) -> Number, A faster vector distance function.
   -magnitude() -> Number
   -norm(n) -> Number, The nth vectorm norm, defaults to 2.
   -angle_between(other_vector) -> Vector
   -project_onto(other_vector) -> Vector
   -x(), y(), z() -> Number,    Convenience functions.
   -elm(i) -> Number

 Matrix: $m( [[row1a, row1b, row1c], [row2a, row2b, row2c]] )
   -matrix() -> Matrix
   -elm(i,j) -> Number
   -add(matrix_or_scalar) -> Matrix
   -subtract(matrix_or_scalar) -> Matrix
   -multiply(matrix_or_scalar) -> Matrix
   -divide(matrix) -> Matrix
   -transpose() -> Matrix
   -determinant() -> Number
   -inverse() -> Matrix
   -rotate() NOT IMPL
   -identity() -> Matrix
   -normalize() NOT IMPL

 Polygon: $p( [ [x1, y1], [x2, y2], [x3, y3], [x4, y4] ] )
   -matrix() -> Matrix
   -polygon() -> Polygon
   -add_point(vector) -> Polygon
   -to_point_array() -> Array
   -foreach(fn) -> Polygon, Calls fn with each node inside the polygon
   -point_inside_2d(vector) -> Boolean
   -point_inside_fast_2d(vector) -> Boolean
   -clip_2d(polygon) -> Polygon, or null if no operation took place
   -union_2d(polygon) -> Polygon, or null if no operation took place
   -subtract_2d(polygon) -> Polygon, or null if no operation took place
   -area_2d() -> Number
   -centroid_2d() -> Vector
   -centroid_3d() -> Vector
   -convex_hull_2d() -> Polygon
   -contains_2d(other_polygon) -> Boolean
   -intersects_2d(other_polygon) -> Array of vectors(intersections) or null

 LatitudeLongitude: $ll( [latitude, longitude, altitude] )
   -vector() -> Vector, convert to WSG84 x/y/z coords
   -latlng() -> LatLng
   -lat(), lng(), alt() -> Number, convenience functions
   -distance_to(latlng)  -> Number (meters), Uses the Vincenty eq. for mm precision
   -distance_to_miles(latlng)  -> Number (miles)
   -bearing_between(latlng) -> Number
   -destination_given_distance_and_bearing(distance_in_meters, bearing)  -> LatLng


 Known bugs:

 * Math is not my strong suit
 * Boolean operations on polygons are still not reliable.  There are some kinks in the algorithm.
 * Some of the general case operations on a matrix are not yet implemented.  It's because they are hard,
   and I don't personally need them right now.


 Chris Z
 For work at www.indy.com
 Talked about at www.yeti-factory.org

*/
define([], function (FlashDetect) {

var _matrix = function(o){
  return new _matrix.class.assert(o);
},
_vector = function(o){
  return new _vector.class.assert(o);
},
_polygon = function(o){
  return new _polygon.class.assert(o);
},
_latlng = function(o){
  return new _latlng.class.assert(o);
};

var $m = _matrix, $v = _vector, $p = _polygon, $ll = _latlng;

_matrix.class = _matrix.prototype = {
  assert : function(obj){
    var m;
    if(obj == undefined || obj == null){
      this.data = [];
      this.rows = 0;
      this.columns = 0;
      this.square = false;
    } else if(typeof(obj.matrix) == "function" && (m = obj.matrix()) ) {
      this.data = m.data;
      this.square = m.square;
      this.rows = m.rows;
      this.columns = m.columns;
    } else if(obj.length) {
      this.data = obj;
      this.rows = this.data.length;
      this.columns = this.data[0].length;
      if(this.rows > 0){
        this.square = this.columns == this.rows;
      } else {
        this.square = false;
      }
    }
    return this;
  },
  matrix : function(){
    return this;
  },
  equalDimensions : function(other){
    var om = _matrix(other);
    return this.rows == om.rows && this.columns == om.columns;
  },
  elm : function(i, j){
    return this.data[i][j];
  },
  add : function(other){
    var scalar = false, mt = null;
    if(typeof(other)=="number"){
      scalar = true;
    } else {
      mt = _matrix(other);
    }
    if(scalar || this.equalDimensions(mt)){
      var res = [];
      for(var i = 0; i < this.rows; i++){
        var row = [];
        for(var j =0; j < this.columns; j++){
          if(scalar){
            row.push(this.elm(i,j) + other);
          } else {
            row.push(this.elm(i,j) + mt.elm(i,j));
          }
        }
        res.push(row);
      }
      return _matrix(res);
    } else {
      throw new Error("Matrix dimensions must be equal");
    }
  },
  subtract : function(other){
    var scalar = false, mt = null;
    if(typeof(other) == "number"){
      scalar = true;
    } else {
      mt = _matrix(other);
    }
    if(scalar || this.equalDimensions(mt)){
      var res = [];
      for(var i = 0; i < this.rows; i++){
        var row = [];
        for(var j =0; j < this.columns; j++){
          if(scalar){
            rows.push(this.elm(i,j) - other);
          } else {
            row.push(this.elm(i,j) - mt.elm(i,j));
          }

        }
        res.push(row);
      }
      return _matrix(res);
    } else {
      throw new Error("Matrix dimensions must be equal");
    }
  },
  multiply : function(other){
    var scalar = false, mt = null, cols = 0;
    if(typeof(other) == "number"){
      scalar = true;
      cols = this.columns;
    } else {
      mt = _matrix(other);
      cols = mt.columns;
    }
    if(scalar || this.columns == mt.rows){
      var res = [];
      for(var i = 0; i < this.rows; i++){
        var row = [];
        for(var j = 0; j < cols; j++){
          var s = 0;
          if(scalar){
            s = this.elm(i, j) * other;
          } else {
            for(var r = 0; r < this.columns; r++){
              s += this.elm(i, r) * mt.elm(r, j);
            }
          }
          row.push(s);
        }
        res.push(row);
      }
      return _matrix(res);
    } else {
      throw new Error("Multiplication invalid with given matrix");
    }
  },
  divide : function(other){
    return this.multiply(_matrix(other).inverse());
  },
  transpose : function(){
    var res = [];
    for(var i = 0; i < this.columns; i++){
      var row = [];
      for(var j = 0; j < this.rows; j ++){
        row.push(this.elm(j,i));
      }
      res.push(row);
    }
    return _matrix(res);
  },
  inverse : function(){
    if(!this.square)
      throw new Error("Inversion is only valid for a square matrix");
    var inv2 = function(m){
      var denom = 1 / (m.elm(0,0) * m.elm(1,1) - m.elm(0,1) * m.elm(1,0));
      return _matrix([[m.elm(1,1), -1 * m.elm(0,1)],[-1 * m.elm(1,0), m.elm(0,0)]]).multiply(denom);
    };
    if(this.rows == 2) return inv2(this);
    throw new Error("TODO: General case inversion for n-sized matrix");
  },
  determinant : function(){
    if(!this.square)
      throw new Error("Determinant is only valid for a square matrix");
    var det2 = function(m){
      return m.el(0,0) * m.el(1,1) - m.el(0,1) *m.el(1, 0);
    };
    var det3 = function(m){
      return (m.el(0,0) * m.el(1,1) * m.el(2,2) +
              m.el(0,1) * m.el(1,2) * m.el(2,0) +
              m.el(0,2) * m.el(1,0) * m.el(2,1)) -
        (m.el(2, 0) * m.el(1,1) * m.el(0,2) +
         m.el(2, 1) * m.el(1,2) * m.el(0,0) +
         m.el(2, 2) * m.el(1,0) * m.el(0,1));
    };
    if(this.rows == 2) return det2(this);
    if(this.rows == 3) return det3(this);
    throw new Error("TODO: Gaussian elimination for n-size matrix");
    return null;
  },
  rotate : function(){
    throw new Error("TODO: Not implemented");
  },
  identity : function(){
    var res = [];
    for(var i = 0; i < this.rows; i ++){
      var row = [];
      for(var j = 0; j < this.columns; j ++){
        row.push( (i==j) ? 1 : 0 );
      }
      res.push(row);
    }
    return _matrix(res);
  },
  normalize : function(){
    throw new Error("TODO: Not implemented");
  }
},
_vector.class = _vector.prototype = {
  assert : function(obj){
    this.data = [0, 0, 0];
    if(obj == undefined || obj == null){
      this.dims = 0;
      this.data = [];
    } else if(obj.vector && typeof(obj.vector) == "function"){
      var v = obj.vector();
      this.data = v.data;
      this.dims = v.dims;
    } else if(obj.x || obj.y || obj.z){
      this.data[0] = obj.x || 0.0;
      this.data[1] = obj.y || 0.0;
      this.data[2] = obj.z || 0.0;
    } else if(obj.length){
      this.data = obj;
      this.dims = obj.length;
    }       
    return this;
  },
  vector : function(){
    return this;
  },

  matrix : function(){
    return _matrix([this.data]);
  },
  latlng : function(){
    var x = this.data[0], y = this.data[1], z = this.data[2] || 0.0;
    var lon = Math.atan2(y, x);
    var p = Math.sqrt(Math.pow(x,2) + Math.pow(y, 2));
    var th = Math.atan( (z * _latlng.WGS84_RADIUS_MAJOR) / (p * _latlng.WGS84_RADIUS_MINOR));
    var lat_numer = z + _latlng.WGS84_SECOND_ECCENTRICITY_SQUARED * _latlng.WGS84_RADIUS_MINOR * Math.pow(Math.sin(th), 3);
    var lat_denom = p - _latlng.WGS84_FIRST_ECCENTRICITY_SQUARED * _latlng.WGS84_RADIUS_MAJOR * Math.pow(Math.cos(th), 3);
    var lat = Math.atan(lat_numer / lat_denom);
    var curv_radius = _latlng.WGS84_RADIUS_MAJOR / Math.sqrt(1 - (_latlng.WGS84_FIRST_ECCENTRICITY_SQUARED * Math.pow(Math.sin(lat), 2)));
    var hgt = (p / Math.cos(lat))  - curv_radius;
    return _latlng([_vector.numberToDegrees(lat), _vector.numberToDegrees(lon), hgt]);
  },
  x : function(){
    return this.data[0];
  },
  y : function(){
    return this.data[1];
  },
  z : function(){
    return this.data[2];
  },
  toString : function (){
    var s = "[Vector:(";
    s += this.data.join (",");
    s += ")]";
    return s;
  },
  compareTo : function (other){
    var o = _vector (other);
    if (this.dims != o.dims){
      throw new Error ("Vector dimensions must be equal");
    }
    var origin = _vector.origin (this.dims);
    var this_distance = this.distance (origin);
    var o_distance = o.distance (origin);
    if (this_distance < o_distance){
      return -1;
    } else if (this_distance > o_distance) {
      return 1;
    } else {
      return 0;
    }
  },
  equals : function (other){
    var o = _vector (other);
    if (this.dims != o.dims){
      return false;
    }
    for (var i = 0; i < this.dims; i++){
      if (this.elm (i) != o.elm (i)){
        return false;
      }
    }
    return true;
  },
  add : function(other){
    var scalar = false, ov = null;
    if(typeof(other) == "number"){
      scalar = true;
    } else {
      ov = _vector(other);
    }
    if(scalar || this.dims == ov.dims){
      var res = [];
      for(var i = 0; i < this.dims; i++){
        if(scalar){
          res.push(this.elm(i) + other);
        } else {
          res.push(this.elm(i) + ov.elm(i));
        }
      }
      return _vector(res);
    } else {
        throw new Error("Vector dimensions must be equal");
    }
  },
  subtract : function(other){
    var scalar = false, ov = null;
    if(typeof(other) == "number"){
      scalar = true;
    } else {
      ov = _vector(other);
    }
    if(scalar || this.dims == ov.dims){
      var res = [];
      for(var i = 0; i < this.dims; i++){
        if(scalar){
          res.push(this.elm(i) - other);
        } else {
          res.push(this.elm(i) - ov.elm(i));
        }
      }
      return _vector(res);
    } else {
      throw new Error("Vector dimensions must be equal");
    }
  },
  multiply : function(other){
    if(!typeof(other) == "number"){
      throw new Error("You must pass a scalar value");
    }
    var res = [];
    for(var i = 0; i < this.dims; i++){
      res.push(this.elm(i) * other);
    }
    return _vector(res);
  },
  dot_product : function(other){
    var res = 0;
    var v = _vector(other);
    if(v.dims != this.dims)
      throw new Error("Vector dimensions must be equal");
    for(var i = 0; i < this.dims; i++){
      res += this.elm(i) * v.elm(i);
    }
    return res;
  },
  cross_product : function(other){
    var v = _vector(other);
    if(v.dims != this.dims)
      throw new Error("Vector dimensions must be equal");
    if(v.dims != 2 && v.dims != 3)
      throw new Error("Cross product is only valid for 2 or 3 dimensional vectors");
    if(v.dims == 2){
      return (this.elm(0) * v.elm(1) - this.elm(1) * v.elm(0));
    } else {
      var res  = [
        this.elm(1) * v.elm(2) - this.elm(2) * v.elm(1), // x
        this.elm(2) * v.elm(0) - this.elm(0) * v.elm(2), // y
        this.elm(0) * v.elm(1) - this.elm(1) * v.elm(0) //z
      ];
      return _vector(res);
    }
  },
  distance : function(other){
    var v = _vector(other);
    if(v.dims != this.dims)
      throw new Error("Vector dimensions must be equal");
    var sum = 0;
    var d = 0;
    for (var i =0; i < v.dims; i++) {
      d = v.elm(i) - this.elm (i);
      sum += Math.pow (d, 2);
    }
    return Math.sqrt(sum);
  },
    midpoint : function(other){
        var v = _vector(other);
        var m = [];
        if(v.dims != this.dims)
            throw new Error("Vector dimensions must be equal");
        for(var i = 0; i < v.dims; i++){
            m.push( (this.elm(i) + v.elm(i)) / 2);
        }
        return _vector(m);
    },
  midpoint_2d : function(other){
      return this.midpoint(other);
  },
  distance_2d_fast : function(other){
    var v = _vector(other);
    if(v.dims != this.dims)
      throw new Error("Vector dimensions must be equal");
    if(v.dims < 2)
      throw new Error("Vector must be 2 dimensional");
  	var dx = Math.abs(v.elm(0) - this.elm(0));
  	var dy = Math.abs(v.elm(1) - this.elm(1));
	  if(dy>=dx){
		  return (0.41 * dx) + (0.941246 * dy);
	  } else {
		  return (0.41 * dy) + (0.941246 * dx);
	  }
  },
  magnitude : function(){
    return Math.sqrt(this.dot_product(this));
  },
  norm : function(n){
    if(n == undefined || n == null)
      n = 2;
    var res = 0;
    for(var i = 0; i < this.dims; i++){
      res += Math.pow(this.elm(i), n);
    }
    res = Math.pow(res, 1/n);
    return res;
  },
  angle_between : function(other){
    var v = _vector(other);
    if(v.dims != this.dims)
      throw new Error("Vector dimensions must be equal");
    var numer = this.dot_product(v);
    var denom = this.magnitude() * v.magnitude();
    return Math.acos(numer/denom);
  },
  project_onto : function(other){
    var v = _vector(other);
    if(v.dims != this.dims)
      throw new Error("Vector dimensions must be equal");
    var numer = this.dot_product(other);
    var denom = Math.pow(other.magnitude(), 2);
    return other.multiply(numer/denom);
  },
  elm : function(i){
    return this.data[i];
  }
},
_polygon.class = _polygon.prototype = {
  assert : function(obj){
    if(obj == undefined || obj == null){
      this.head = null;
      this.tail = null;
      this.count = 0;
    } else if(obj.polygon && typeof(obj.polygon) == "function"){
      var p = obj.polygon();
      this.head = p.head;
      this.tail = p.tail;
      this.count = p.count;
    } else if(obj.length){
      this.count = 0;
      for(var i = 0; i < obj.length; i++){
        this.add_point(obj[i]);
      }
    }
    return this;
  },
  polygon : function(){
    return this;
  },
  matrix : function(){
    return _matrix(this.to_point_array());
  },
  vtx : function(pt, attribs){
    this.x = (pt[0]) || 0.0; // floatFix
    this.y = (pt[1]) || 0.0; // floatFix
    this.z = (pt[2]) || 0.0;
    this.next = null;
    this.prev = null;
    this.nextPoly = null;
    this.intersect = false;
    this.neighbor = null;
    this.couple = null;
    this.alpha = 0.0;
    this.entry_exit = 0;
    this.copy = function(){
      return new _polygon.class.vtx([this.x, this.y], {
                       alpha: this.alpha,
                       entry_exit: this.entry_exit
                     });
    };
    this.filtered_prev = function(filter){
      var cur = this.prev;
      while(cur != this){
        if(filter(cur)){
          return cur;
        }
        cur = cur.prev;
      }
      return null;
    };
    this.filtered_next = function(filter){
      var cur = this.next;
      while(cur != this){
        if(filter(cur)){
          return cur;
        }
        cur = cur.next;
      }
      return null;
    };
    this.next_non_intersecting = function(){
      return this.filtered_next(function(node){
                                  return !node.intersect;
                                });
    };
    if(attribs != null && attribs != undefined){
      for(var k in attribs){
        this[k] = attribs[k];
      }
    }
    return this;
  },
  add_point : function(point, attribs){
    var v = new _polygon.class.vtx(point, attribs);
    this.add_vtx(v);
    return this;
  },
  add_vtx : function(vtx){
    if(this.head == null){
      this.head = vtx;
      this.tail = vtx;
      this.head.prev = this.head;
      this.head.next = this.head;
      this.count ++;
    } else {
      this.insert_vertex_after(vtx, this.tail);
    }
    return this;
  },
  to_point_array : function(){
    var a = [];
    this.foreach(function(node){
                   a.push([node.x, node.y, node.z]);
                 });
    return a;
  },
  foreach : function(fn){
    var node = this.head;
    do {
      fn.apply(this, [node]);
      node = node.next;
    } while(node != this.head);
    return this;
  },
  insert_sort_between : function(vtx, previous, vnext){
    var c = previous;
    while(c != vnext && c.alpha < vtx.alpha)
      c = c.next;
    this.insert_vertex_before(vtx, c);
    return this;
  },
  insert_vertex_before : function(vtx, before){
    var prv = before.prev;
    before.prev = vtx;
    prv.next = vtx;
    vtx.next = before;
    vtx.prev = prv;
    if(before == this.head){
      this.tail = vtx;
    }
    this.count ++;
    return this;
  },
  insert_vertex_after : function(vtx, after){
    var nxt = after.next;
    after.next = vtx;
    nxt.prev = vtx;
    vtx.prev = after;
    vtx.next = nxt;
    if(this.tail == after){
      this.tail = vtx;
    }
    this.count ++;
    return this;
  },
  remove_vertex : function(vtx){
    var prv = vtx.prev, nxt = vtx.next;
    if(prv == nxt && prv == vtx){
      this.head = null;
      this.tail = null;
      this.count = 0;
      return;
    } else {
      prv.next = nxt;
      nxt.prev = prv;
      if(vtx == this.head){
        this.head = nxt;
      }
      if(vtx == this.tail){
        this.tail = prv;
      }
      this.count --;
    }
  },
  _clean : function(){
    var c = this.head;
    do {
      var n = c.next;
      if(c.intersect){
        this.remove_vertex(c);
      }
      c = n;
    } while(c != null && c != this.head);
  },
  contains_2d : function(other){
    var p = _polygon(other);
    var inside = 0;
    this.foreach(function(node){
                   if(p.point_inside_2d(node)){
                     inside++;
                   }
                 });
    return (inside == this.count);
  },
  intersects_2d : function(other){
    var p = _polygon(other);
    var points = [];
    this.foreach(function(si){
                   p.foreach(function(cj){
                               var snext = si.next_non_intersecting(), cnext = cj.next_non_intersecting();
                               if(snext == null || cnext == null) throw new Error("Polygon list integrity broken"); // list integrity broken
                               var pt = _vector.pointOfIntersectionForLineSegments([[si.x, si.y], [snext.x, snext.y]],
                                                                                   [[cj.x, cj.y], [cnext.x, cnext.y]]);

                               if(pt != null){
                                 points.push(_vector(pt[0], pt[1]));
                               }
                             });
                 });
    if(points.length == 0)
      return null;
    else
      return points;
  },
  // winding number calc
  // taken from brenor's php impl.
  point_inside_2d : function(vtx){
    var w = 0,
    v = _vector(vtx),
    inf = [-10000000, v.y()];
    this.foreach(function(node){
                   if(!node.intersect){
                     var nxt = node.next_non_intersecting();
                     var seg = [inf, [v.x(), v.y()]],
                     seg2 = [[node.x, node.y], [nxt.x, nxt.y]],
                     intersection = _vector.pointOfIntersectionForLineSegments(seg, seg2);
                     if(intersection != null){
                       w++;
                     }
                   }
                 });
    return ((w % 2) != 0);
  },
  // http://local.wasp.uwa.edu.au/~pbourke/geometry/insidepoly/
  // modified version of randolph franklin's c func
  // does not evaluate true if exactly on line segment
  point_inside_fast_2d : function(p){
    var pt = _vector(p);
    var c = false;
    var x = pt.x(), y = pt.y();
    this.foreach(function(node){
                   var poly = node,
                   last_poly = node.prev;
                   if ((((poly.y <= y) && (y < last_poly.y)) ||
                     ((last_poly.y <= y) && (y < poly.y))) &&
                     (x < (last_poly.x - poly.x) * (y - poly.y) / (last_poly.y - poly.y) + poly.x))
                     c = !c;
                 });
    return c;
  },
  // thanks to Anton Venema (http://blog.frozenmountain.com/) for the pointer to the melkman algo
  convex_hull_2d: function(){
    if(this.count <= 3) return _polygon(this);
    var deque = [];
    var points = this.to_point_array();
    // from http://softsurfer.com/Archive/algorithm_0101/algorithm_0101.htm#isLeft()
    function isPointLeftOfLine(test, segment_a, segment_b){
      var side = (segment_b[0] - segment_a[0]) * (test[1] - segment_a[1]) - (test[0] - segment_a[0]) * (segment_b[1] - segment_a[1]);
      return side;
    };
    deque.push(points[2]);
    if(isPointLeftOfLine(points[2], points[0], points[1]) > 0){
      deque.push(points[0]); dequeu.push(points[1]);
    } else {
      deque.push(points[1]); dequeu.push(points[0]);
    }
    deque.push(points[2]);
    for(var i = 3; i < points.length; i++){
      var last = deque.length - 1;
      if(isPointLeftOfLine(points[i], deque[0], deque[1]) > 0 &&
         isPointLeftOfLine(points[i], deque[last-1], deque[last]) > 0){
        continue;
      }

      while(isPointLeftOfLine(points[i], deque[0], deque[1]) < 0){
        deque.splice(0, 1);
      }
      deque.splice(0, 0, points[i]);

      last = deque.length - 1;
      while(isPointLeftOfLine(points[i], deque[last - 1], deque[last]) < 0){
        deque.pop();
        last--;
      }
      deque.push(points[i]);
    }
    return _polygon(deque);
  },
  clip_2d : function(other){
    return this._boolean_2d(other);
  },
  union_2d : function(other){
    return this._boolean_2d(other, "|");
  },
  subtract_2d : function(other){
    return this._boolean_2d(other, "-");
  },
  area_2d : function(){
    var current = this.head;
    var sum = 0.0;
    do {
      var next = current.next;
      sum += current.x * next.y - next.x * current.y;
      current = next;
    } while(current != this.tail);
    return sum * 0.5;
  },
  centroid_2d : function(){
    var area = this.area_2d();
    var mult = 1.0 / (6.0 * area);
    var cx = 0.0, cy = 0.0;
    var current = this.head;
    do {
      var next = current.next;
      var mult2 = (current.x * next.y - next.x * current.y);
      cx += (current.x + next.x) * mult2;
      cy += (current.y + next.y) * mult2;
      current = next;
    } while(current != this.tail);
    cx *= mult;
    cy *= mult;
    return _vector([cx, cy]);
  },
  centroid_3d : function(){
    var numfaces = Math.floor(this.count / 3);
    var numer = [0, 0, 0], denom = 0;
    var current = this.head;
    for(var i = 0; i < numfaces; i++){
      var a = current,
      b = current.next,
      c = current.next.next;
      var da = [
        b.x - a.x,
        b.y - a.y,
        b.z - a.z
      ], db = [
        c.x - a.x,
        c.y - a.y,
        c.z - a.z
      ];
      var mag =_vector(da).cross_product(db).magnitude();
      denom += mag;
      numer[0] += mag * ((a.x + b.x + c.x) / 3);
      numer[1] += mag * ((a.y + b.y + c.y) / 3);
      numer[2] += mag * ((a.z + b.z + c.z) / 3);
      current = c.next;
    }
    numer[0] /= denom;
    numer[1] /= denom;
    numer[2] /= denom;
    return _vector(numer);
  },
  // defaults to subtraction of subject from clip
  // other operations can be "|" union, "&" intersection, "-" set subtraction
  // entry matrix and perturbation taken from php impl. at 	www.brenorbrophy.com
  // thanks Brenor :-)
  _boolean_2d : function(other, operation){
    var STATUS_EXIT = 1,
        STATUS_ENTRY = -1;
    var clist = _polygon(other),
        slist = this;
    var perturb = 0.999999;
    if(operation == null || operation == undefined) operation = null; // default to clip
    var floatFix = function(n, places){
      if(places == null || places == undefined){
        places = 5;
      }
      return parseFloat(n.toFixed(places));
    };
    slist.foreach(function(si){
                    if(!si.intersect){
                      clist.foreach(function(cj){
                                      if(!cj.intersect){
                                        var snext = si.next_non_intersecting(), cnext = cj.next_non_intersecting();
                                        if(snext == null || cnext == null) throw new Error("Polygon list integrity broken"); // list integrity broken
                                        var pt = _vector.pointOfIntersectionForLineSegments([[si.x, si.y], [snext.x, snext.y]],
                                                                                    [[cj.x, cj.y], [cnext.x, cnext.y]]);

                                        if(pt != null){
                                          var ix = floatFix(pt[0]), iy = floatFix(pt[1]), ua = floatFix(pt[2], 3), ub = floatFix(pt[3], 3);
                                          if(ua == 0 || ua == 1 || ub == 0 || ub == 1){
                                            if(ua == 0){
                                              si.x = si.x + floatFix((1 - perturb) * (snext.x - si.x));
                                              si.y = si.y + floatFix((1 - perturb) * (snext.y - si.y));
                                            } else if(ua == 1){
                                              snext.x = si.x + floatFix(perturb * (snext.x - si.x));
                                              snext.y = si.y + floatFix(perturb * (snext.y - si.y));
                                            } else if(ub == 0) {
                                              cj.x = cj.x + floatFix((1 - perturb) * (cnext.x - cj.x));
                                              cj.y = cj.y + floatFix((1 - perturb) * (cnext.y - cj.y));
                                            } else if(ub == 1){
                                              cnext.x = cj.x + floatFix(perturb * (cnext.x - cj.x));
                                              cnext.y = cj.y + floatFix(perturb * (cnext.y - cj.y));
                                            }
                                          } else {
                                            var is = new _polygon.class.vtx([ix, iy], {
                                                               alpha : ua,
                                                               intersect : true
                                                             }),
                                            ic = new _polygon.class.vtx([ix, iy], {
                                                           alpha : ub,
                                                           intersect : true
                                                         });
                                            is.neighbor = ic;
                                            ic.neighbor = is;
                                            slist.insert_sort_between(is, si, snext);
                                            clist.insert_sort_between(ic, cj, cnext);
                                          }

                                        }
                                      }
                                    });
                    }
                  });
    var a, b; // default to clipping subject by clip
    switch(operation){
    case "|":
      a = true;
      b = true;
      break;
    case "-":
      a = true;
      b = false;
      break;
    default :
      a = false;
      b = false;
      break;
    }
    var polys = [slist, clist],
    entry_table = [a, b];
    for(var i = 0, j = polys.length - 1; i < polys.length; j = i++){
      var polygon = polys[i],
      other_polygon = polys[j];
      var interior =  other_polygon.point_inside_2d(polygon.head);
      var entry;
      if(interior){
        entry = !entry_table[i];
      } else {
        entry = entry_table[i];
      }
      var status = (entry) ? STATUS_EXIT : STATUS_ENTRY;
      polygon.foreach(function(node){
                        if(node.intersect){
                          node.entry_exit = status;
                          status = (status == STATUS_ENTRY) ? STATUS_EXIT : STATUS_ENTRY;
                        }
                      });
    }
    var result = null, unprocessed = [];
    slist.foreach(function(node){
                    if(node.intersect && !node.processed){
                      unprocessed.push(node);
                    }
                  });
    for(var i = 0; i < unprocessed.length; i++){
      var current = unprocessed[i];
      if(current.processed){
        continue;
      }
      var new_poly = _polygon();
      do {
        for(; !current.processed; current = current.neighbor)
        for(var forward = current.entry_exit;;){
          current.processed = true;
          var n = current.copy();
          new_poly.add_vtx(n);
          current = (forward == STATUS_ENTRY) ? current.next : current.prev;
          if(current.intersect){
            current.processed = true;
            break;
          }
        }
      } while(!current.processed);

      if(result != null){
        new_poly.head.nextPoly = result;
      }
      result = new_poly;
    }
    slist._clean();
    clist._clean();
    return result;
  }
},
// The distance, bearing and destination code is taken from Chris Veness
// http://www.movable-type.co.uk/scripts/latlong.html
_latlng.class = _latlng.prototype = {
  assert : function(obj){
    if(obj == undefined || obj == null){
      this.data = [0.0, 0.0, 0.0];
    } else if(obj.latlng && typeof(obj.latlng) == "function"){
      var ll = obj.latlng();
      this.data = ll.data;
    } else if(obj.length){
      if(obj.length > 3 || obj.length < 2)
        throw new Error("You must provide at least 2 coordinates (latitude, longitude) and at most 3 coordinates (latitude, longitude, altitude)");
      this.data = obj;
      if(this.data.length == 2) this.data.push(0.0); // no altitude
    }
    return this;
  },
  _toCartesian : function(){
    var lat = _vector.numberToRadians(this.data[0]),
    lon = _vector.numberToRadians(this.data[1]),
    alt = this.data[2] || 0.0;
    var a = _latlng.WGS84_RADIUS_MAJOR;
    var b = _latlng.WGS84_RADIUS_MINOR;
    var eccsq = _latlng.WGS84_FIRST_ECCENTRICITY_SQUARED;
    var latsin = Math.sin(lat);
    var latcos = Math.cos(lat);
    var curv_radius = a / Math.sqrt(1 - (eccsq * Math.pow(latsin, 2)));
    var x = (curv_radius + alt) * latcos * Math.cos(lon);
    var y = (curv_radius + alt) * latcos * Math.sin(lon);
    var z = (_latlng.WGS84_CURVE_MULTIPLICAND * curv_radius + alt) * latsin;
    return [x, y, z];
  },
  vector : function(){
    return _vector(this._toCartesian());
  },
  matrix : function(){
    return _matrix(this._toCartesian());
  },
  latlng : function(){
    return this;
  },
  lat : function(){
    return this.data[0];
  },
  lng : function(){
    return this.data[1];
  },
  alt : function(){
    return this.data[2];
  },
  //  Vincenty Inverse Solution of Geodesics on the Ellipsoid (c) Chris Veness 2002-2008
  distance_to : function(other){
    var oll = _latlng(other);
    var lat1 = this.lat(), lon1 = this.lng(), lat2 = oll.lat(), lon2 = oll.lng();
    var a = 6378137, b = 6356752.3142,  f = 1/298.257223563;  // WGS-84 ellipsiod
      var L = _vector.numberToRadians(lon2-lon1);
    var U1 = Math.atan((1-f) * Math.tan(_vector.numberToRadians(lat1)));
    var U2 = Math.atan((1-f) * Math.tan(_vector.numberToRadians(lat2)));
    var sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
    var sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

    var lambda = L, lambdaP, iterLimit = 20;
    do {
      var sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
      var sinSigma = Math.sqrt((cosU2*sinLambda) * (cosU2*sinLambda) +
                               (cosU1*sinU2-sinU1*cosU2*cosLambda) * (cosU1*sinU2-sinU1*cosU2*cosLambda));
      if (sinSigma==0) return 0;  // co-incident points
      var cosSigma = sinU1*sinU2 + cosU1*cosU2*cosLambda;
      var sigma = Math.atan2(sinSigma, cosSigma);
      var sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
      var cosSqAlpha = 1 - sinAlpha*sinAlpha;
      var cos2SigmaM = cosSigma - 2*sinU1*sinU2/cosSqAlpha;
      if (isNaN(cos2SigmaM)) cos2SigmaM = 0;  // equatorial line: cosSqAlpha=0 (§6)
      var C = f/16*cosSqAlpha*(4+f*(4-3*cosSqAlpha));
      lambdaP = lambda;
      lambda = L + (1-C) * f * sinAlpha *
        (sigma + C*sinSigma*(cos2SigmaM+C*cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)));
    } while (Math.abs(lambda-lambdaP) > 1e-12 && --iterLimit>0);

    if (iterLimit==0) return NaN;  // formula failed to converge

    var uSq = cosSqAlpha * (a*a - b*b) / (b*b);
    var A = 1 + uSq/16384*(4096+uSq*(-768+uSq*(320-175*uSq)));
    var B = uSq/1024 * (256+uSq*(-128+uSq*(74-47*uSq)));
    var deltaSigma = B*sinSigma*(cos2SigmaM+B/4*(cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)-
                                                 B/6*cos2SigmaM*(-3+4*sinSigma*sinSigma)*(-3+4*cos2SigmaM*cos2SigmaM)));
    var s = b*A*(sigma-deltaSigma);

    s = parseFloat(s.toFixed(3)); // round to 1mm precision
    return s;
  },
  distance_to_miles : function(other){
    var met = this.distance_to(other);
    return met / _latlng.METERS_PER_MILE;
  },
  bearing_between : function(other){
    var oll = _latlng(other);
    var lat1 = _vector.numberToRadians(this.lat()),
    lat2 = _vector.numberToRadians(oll.lat()),
    lon1 = this.lng(),
    lon2 = oll.lng();
    var dLon = _vector.numberToRadians(lon2-lon1);
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1)*Math.sin(lat2) -
      Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    return _latlng.numberToBearing(Math.atan2(y, x));
  },
  destination_given_distance_and_bearing : function(dist, bearing){
    var lat = this.lat(), lon = this.lng();
    var R = _latlng.EARTH_RADIUS_KM;
    var lat1 = _vector.numberToRadians(lat),
    lon1 = _vector.numberToRadians(lon);
    var brng = _latlng.numberToBearing(bearing);
    var lat2 = Math.asin( Math.sin(lat1)*Math.cos(dist/R) +
                          Math.cos(lat1)*Math.sin(dist/R)*Math.cos(brng) );
    var lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(dist/R)*Math.cos(lat1),
                                 Math.cos(dist/R)-Math.sin(lat1)*Math.sin(lat2));
    lon2 = (lon2+Math.PI)%(2*Math.PI) - Math.PI;  // normalise to -180...+180

    if (isNaN(lat2) || isNaN(lon2)) return null;
    return _latlng([lat2.toDeg(), lon2.toDeg()]);
  }
};

_vector.numberToRadians = function(n){
  return n * Math.PI / 180;
};
_vector.numberToDegrees = function(n){
  return n * 180 / Math.PI;
};
_vector.numberInRange = function(n, min, max){
  return (n >= min && n <= max);
};
// segment: [ [x,y], [x2, y2] ]
// algo and original code from:
// http://local.wasp.uwa.edu.au/~pbourke/geometry/lineline2d/
_vector.pointOfIntersectionForLineSegments = function(seg_a, seg_b){
  var start_a = seg_a[0],  // v1
      end_a = seg_a[1],  // v2
      start_b = seg_b[0], // v3
      end_b = seg_b[1]; // v4
  var denom = (end_b[1] - start_b[1]) * (end_a[0] - start_a[0]) - (end_b[0] - start_b[0]) * (end_a[1] - start_a[1]);
  if(denom == 0) return null; // parallel
  var numer_a = (end_b[0] - start_b[0]) * (start_a[1] - start_b[1]) - (end_b[1] - start_b[1]) * (start_a[0] - start_b[0]);
  var numer_b = (end_a[0] - start_a[0]) * (start_a[1] - start_b[1]) - (end_a[1] - start_a[1]) * (start_a[0] - start_b[0]);
  if(numer_a == 0 && denom == 0 && numer_a == numer_b) return null; // coincident
  var ua = numer_a / denom,
      ub = numer_b / denom;
  if(_vector.numberInRange(ua, 0.0, 1.0) && _vector.numberInRange(ub, 0.0, 1.0)){
    return [
      start_a[0] + ua * (end_a[0] - start_a[0]),
      start_a[1] + ua * (end_a[1] - start_a[1]),
      ua,
      ub
    ]; // return barycenric coordinates for alpha values in greiner-hormann
  }
  return null; // does not intersect
};

// acquire a vector origin with dims dimensions
_vector.origin = function (dims){
  if (typeof (dims) == 'undefined' || dims == null){
    return _vector ([0, 0]);
  } else {
    var a = [];
    for (var i = 0; i < dims; i++){
      a.push (0);
    }
    return _vector (a);
  }
};

_latlng.numberToBearing = function(n){
  return (_vector.numberToDegrees(n)+360) % 360;
};
_latlng.EARTH_RADIUS_KM = 6371; // km
_latlng.WGS84_RADIUS_MAJOR = 6378137.0; // m
_latlng.WGS84_RADIUS_MINOR = 6356752.314245; // m
_latlng.WGS84_FIRST_ECCENTRICITY_SQUARED = 6.69437999014e-3;
_latlng.WGS84_SECOND_ECCENTRICITY_SQUARED = 6.73949674228e-3;
_latlng.WGS84_CURVE_MULTIPLICAND = 9.933056200098024e-1;
_latlng.METERS_PER_MILE = 1609.344;

_matrix.class.assert.prototype = _matrix.class,
_vector.class.assert.prototype = _vector.class,
_polygon.class.assert.prototype = _polygon.class,
_latlng.class.assert.prototype = _latlng.class;

    return {polygon: $p};

});

