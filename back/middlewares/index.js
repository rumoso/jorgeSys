const validaCampos = require('./validar-campos');
const validaJWT = require('./validar-jwt');
const validaAccion = require('./validar-accion');

module.exports = {
    ...validaCampos,
    ...validaJWT,
    ...validaAccion
};
