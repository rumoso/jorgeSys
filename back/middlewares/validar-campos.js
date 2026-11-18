
const { validationResult } = require('express-validator');

const validarCampos = (req,res, next)=>{
    const errors = validationResult(req);

    if(!errors.isEmpty()){
        return res.status(400).json(errors);
    }

    next();
}

// Variante estándar { status_code, message, data }: siempre res.json (HTTP 200),
// el error de validación viaja en status_code = 1 con los mensajes concatenados.
const validarCamposStatusCode = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const message = errors.array().map(e => e.msg).join('. ');
        return res.json({ status_code: 1, message, data: null });
    }

    next();
}


module.exports ={
    validarCampos,
    validarCamposStatusCode
}