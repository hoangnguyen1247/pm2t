var p = new Promise(function(resolve, reject) {
    //setTimeout(function() {
    //throw new Error('fail')
    // let abc = "asdsad";

    return resolve("ok");
    //}, 200)
});

p.then(function(e) {
});
