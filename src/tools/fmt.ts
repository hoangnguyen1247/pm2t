// --------------------------------------------------------------------------------------------------------------------
//
// fmt.js - Command line output formatting.
//
// Copyright (c) 2012 Andrew Chilton - http://chilts.org/
// Written by Andrew Chilton <andychilton@gmail.com>
//
// License: http://opensource.org/licenses/MIT
//
// --------------------------------------------------------------------------------------------------------------------

import util from 'util';

// --------------------------------------------------------------------------------------------------------------------

var sepC = '===============================================================================';
var lineC = '-------------------------------------------------------------------------------';
var fieldC = '                    ';

// --------------------------------------------------------------------------------------------------------------------

// separator
export const separator = function () {
    console.log(sepC);
};

// alias the above
export const sep = separator;

// line
export const line = function () {
    console.log(lineC);
};

// title
export const title = function (title) {
    var out = '--- ' + title + ' ';
    out += lineC.substr(out.length);
    console.log(out);
};

// field
export const field = function (key, value) {
    console.log('' + key + fieldC.substr(key.length) + ' : ' + value);
};

// subfield
export const subfield = function (key, value) {
    console.log('- ' + key + fieldC.substr(key.length + 2) + ' : ' + value);
};

// list item
export const li = function (msg) {
    console.log('* ' + msg);
};

// dump
export const dump = function (data, name) {
    if (name) {
        console.log(name + ' :', util.inspect(data, false, null, true));
    }
    else {
        console.log(util.inspect(data, false, null, true));
    }
};

// msg
export const msg = function (msg) {
    console.log(msg);
};

// --------------------------------------------------------------------------------------------------------------------
