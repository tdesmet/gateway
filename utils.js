
const to = require('await-to-js').default;

function delay(t, val) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve(val);
    }, t);
  });
}


module.exports.delay = delay;


module.exports.callFuncWithTimeout = async function(func, timeout) {
  var result = await Promise.race([to(func()), delay(timeout ? timeout : 30000)]);
  if (Array.isArray(result)) return result;
  return ["timeout"];
}