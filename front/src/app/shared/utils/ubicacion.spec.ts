import { esEnlaceCorto, leerCoordenadas, textoCoordenadas, urlAbrir, urlBuscar, urlFrame } from './ubicacion';

describe('ubicacion', () => {
  describe('leerCoordenadas', () => {
    it('lee coordenadas escritas, con coma o espacio', () => {
      expect(leerCoordenadas('19.4326, -99.1332')).toEqual({ latitud: 19.4326, longitud: -99.1332 });
      expect(leerCoordenadas('  19.4326,-99.1332 ')).toEqual({ latitud: 19.4326, longitud: -99.1332 });
      expect(leerCoordenadas('19.4326 -99.1332')).toEqual({ latitud: 19.4326, longitud: -99.1332 });
      expect(leerCoordenadas('20, -103')).toEqual({ latitud: 20, longitud: -103 });
    });

    it('redondea a 6 decimales', () => {
      expect(leerCoordenadas('19.43260849, -99.13320812')).toEqual({ latitud: 19.432608, longitud: -99.133208 });
    });

    it('lee el pin de un enlace largo (!3d…!4d…) antes que el centro de la vista', () => {
      const url = 'https://www.google.com/maps/place/Z%C3%B3calo/@19.4320,-99.1400,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d19.4326077!4d-99.133208!16s';
      expect(leerCoordenadas(url)).toEqual({ latitud: 19.432608, longitud: -99.133208 });
    });

    it('lee ?q=lat,lng y sus variantes', () => {
      expect(leerCoordenadas('https://www.google.com/maps?q=19.4326,-99.1332')).toEqual({ latitud: 19.4326, longitud: -99.1332 });
      expect(leerCoordenadas('https://maps.google.com/?q=19.4326%2C-99.1332&z=16')).toEqual({ latitud: 19.4326, longitud: -99.1332 });
      expect(leerCoordenadas('https://www.google.com/maps/search/?api=1&query=19.4326,-99.1332'))
        .toEqual({ latitud: 19.4326, longitud: -99.1332 });
    });

    it('lee @lat,lng', () => {
      expect(leerCoordenadas('https://www.google.com/maps/@25.6866,-100.3161,15z')).toEqual({ latitud: 25.6866, longitud: -100.3161 });
    });

    it('regresa null sin coordenadas, fuera de rango o en (0, 0)', () => {
      expect(leerCoordenadas('')).toBeNull();
      expect(leerCoordenadas(null)).toBeNull();
      expect(leerCoordenadas('Av. Juárez 10, Centro')).toBeNull();
      expect(leerCoordenadas('19.4326')).toBeNull();
      expect(leerCoordenadas('91, -99')).toBeNull();
      expect(leerCoordenadas('19, 181')).toBeNull();
      expect(leerCoordenadas('0, 0')).toBeNull();
      expect(leerCoordenadas('https://maps.app.goo.gl/AbCdEf123')).toBeNull();
      expect(leerCoordenadas('https://www.google.com/maps/place/Z%C3%B3calo')).toBeNull();
    });
  });

  it('esEnlaceCorto detecta maps.app.goo.gl y goo.gl/maps', () => {
    expect(esEnlaceCorto('https://maps.app.goo.gl/AbCdEf123')).toBeTrue();
    expect(esEnlaceCorto('maps.app.goo.gl/AbCdEf123')).toBeTrue();
    expect(esEnlaceCorto('https://goo.gl/maps/AbCdEf123')).toBeTrue();
    expect(esEnlaceCorto('https://www.google.com/maps?q=19.4,-99.1')).toBeFalse();
    expect(esEnlaceCorto('19.4326, -99.1332')).toBeFalse();
    expect(esEnlaceCorto('')).toBeFalse();
  });

  it('textoCoordenadas', () => {
    expect(textoCoordenadas({ latitud: 19.4326, longitud: -99.1332 })).toBe('19.4326, -99.1332');
    expect(textoCoordenadas(null)).toBe('');
  });

  it('arma las URL de Google Maps solo con las coordenadas', () => {
    expect(urlFrame(19.4326, -99.1332)).toBe('https://www.google.com/maps?q=19.4326,-99.1332&z=16&output=embed');
    expect(urlAbrir(19.4326, -99.1332)).toBe('https://www.google.com/maps/search/?api=1&query=19.4326,-99.1332');
    expect(() => urlFrame(NaN, 1)).toThrow();
  });

  it('urlBuscar codifica la dirección', () => {
    expect(urlBuscar(' Av. Juárez 10, Centro & más ')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Av.%20Ju%C3%A1rez%2010%2C%20Centro%20%26%20m%C3%A1s');
  });
});
