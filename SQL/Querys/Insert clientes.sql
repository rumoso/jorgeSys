
use db_truck_manager;

SELECT * FROM clientes;

SELECT * FROM direcciones_clientes;

UPDATE direcciones_clientes SET idCliente = 5 where idDireccionCliente = 7;
UPDATE direcciones_clientes SET idCliente = 6 where idDireccionCliente = 8;

INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'COMERCIALIZADORA AGROINDUSTRIAL DEL NORTE','CAN121023NG2',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 2, 'COMERCIALIZADORA AGROINDUSTRIAL DEL NORTE', 'Carr Mexicali‐ San Felipe No. 1198, , C.P.: 21363, 01, 001, Baja California, México', '', '', 1;


INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'CADENA COMERCIAL OXXO','CCO8605231N4',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 3, 'CADENA COMERCIAL OXXO TIJUANA', 'Corredor Tijuana Rosarito 2000 No. 24602, Ejido Francisco Villa, C.P.: 22236, Tijuana, Tijuana, Baja California, México', '', '', 1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 3, 'CADENA COMERCIAL OXXO MEXICALI', 'Guillermo Cardenas No. 4530, Diez División Dos, C.P.: 21395, Mexicali, Mexicali, Baja California, México', '', '', 1;


INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'CENTRAL DETALLISTA','CDE8401046V6',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 4, 'CENTRAL DETALLISTA', 'Carretera Libre Tijuana Tecate No. 20481, El Florido I, C.P.: 22244, Tijuana, Tijuana, Baja California, México', '', '', 1;




INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'CASA LEY','CLE810525EA1',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 5, 'CASA LEY', 'Lote 29 No. S/N, Huertas de La Progreso, C.P.: 21190, Mexicali, Mexicali, Baja California, México', '', '', 1;




INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'DISTRIBUIDORA ARHO','DAR120509JE7',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 6, 'DISTRIBUIDORA ARHO', 'Garval No. 22054, Int. 2, Las Torres, C.P.: 22470, Tijuana, Tijuana, Baja California, México', '', '', 1;



INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'DISTRIBUIDORA EL FLORIDO ','DFL9508025N4',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 7, 'DISTRIBUIDORA EL FLORIDO ', 'Real de la Gloria, Costa Dorada, No. 22666, Francisco Zarco, C.P.: 22660, Tijuana, Tijuana, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;



INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'DICONSA OVIEDO MOTA','DIC860428M2A',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 8, 'DICONSA OVIEDO MOTA MEXICALI', 'Carretera a San Luis B Sanchez No. , Venustiano Carranza, C.P.: 21739, 01, Mexicali, Baja California, México', '', '', 1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 8, 'DICONSA OVIEDO MOTA TIJUANA', 'Blvd. Ferrocarril, SN El rinconsito, Tijuana Baja California, Mexico C.P.:21335', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;




INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'FOOD SERVICE DE MEXICO','FSM960712789',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 9, 'FOOD SERVICE DE MEXICO', '3 Sur No. 9051, Int. D, Ciudad Industrial, C.P.: 22444, Tijuana, Tijuana, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;


UPDATE clientes SET nombre = 'GUGA MERCANTIL' where idCliente = 10;

INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'GUGA MERCANTIL LAGO','GME070103AS4',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 10, 'GUGA MERCANTIL LAGO', 'Av. Pso El Lago No. 19407, El Lago, C.P.: 22210, Tijuana, Tijuana, Baja California, México', '', '', 1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 10, 'GUGA MERCANTIL MURUA', 'Av. Pso El Lago No. 19407, El Lago, C.P.: 22210, Tijuana, Tijuana, Baja California, México', '', '', 1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 10, 'GUGA MERCANTIL CENTRO', 'Av. Pso El Lago No. 19407, El Lago, C.P.: 22210, Tijuana, Tijuana, Baja California, México', '', '', 1;

UPDATE direcciones_clientes SET direccion = 'Av. Murua Martínez No. 1000, Campestre Murua, C.P.: 22455, Tijuana, Tijuana, Baja California, México' where idDireccionCliente = 14;
UPDATE direcciones_clientes SET direccion = 'Av Melchor Ocampo 447, Zona Centro, 22000 Tijuana, B.C.' where idDireccionCliente = 15;


SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;






INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'IMPULSORA SAHUAYO','ISA950810229',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 11, 'IMPULSORA SAHUAYO', 'Astrologos No. 14104, INDECO Universidad, C.P.: 22427, Tijuana, Tijuana, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;



INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'NASE DISTRIBUCION Y LOGISTICA DE TIJUANA','NDL030409811',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 12, 'NASE DISTRIBUCION Y LOGISTICA DE TIJUANA', 'Vientos Alisios No. 17, Las Lilas, C.P.: 22105, Tijuana, Tijuana, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;




INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'NUEVA WAL MART DE MEXICO','NWM9709244W4',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 13, 'NUEVA WAL MART DE MEXICO', 'Nextengo No. 78, Santa Cruz Acayucan, C.P.: 02770, Ciudad de México, 002, Ciudad de México, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;



INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'PRODUCTOS ALIMENTICIOS LA MODERNA','PAM781201CW0',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 13, 'PRODUCTOS ALIMENTICIOS LA MODERNA', 'AV. Industrial Puebla No. 562, Int. 1, Puebla, C.P.: 21620, 01, Mexicali, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;

UPDATE direcciones_clientes SET idCliente = 14 where idDireccionCliente = 19;



INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'PROVEEDORA DE ABARROTES TRG','PAT150320UJ8',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 14, 'PROVEEDORA DE ABARROTES TRG', 'Calle 10 y Ensenada No. 98, Ulbrich, C.P.: 22830, Ensenada, Ensenada, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;

UPDATE direcciones_clientes SET idCliente = 15 where idDireccionCliente = 20;




INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'PRODUCTO DE CONSUMO Z','PCZ071128UM9',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 16, 'PRODUCTO DE CONSUMO Z', '11 NTE No. 1001, Ciudad Industrial, C.P.: 22444, Tijuana, Tijuana, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;





INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'EMPAQUES Y EMBALAJES','PEE0007118TA',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 17, 'EMPAQUES Y EMBALAJES MEXICALI', 'Av. De Los Insurgentes, No. 1510, Las Delicias, C.P.: 21297, Mexicali, Mexicali, Baja California, México', '', '', 1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 17, 'EMPAQUES Y EMBALAJES TIJUANA', 'Blvd. Olivos Nte. 23002, Parque Industrial el Florido II, 22237 Tijuana, B.C.', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;








INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'PAPELES Y GRAFICOS DE BC','PGB931215RJ3',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 18, 'PAPELES Y GRAFICOS DE BC', '6ta No. 13, La Mesa, C.P. 22105, Tijuana, Baja California,México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;




INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'PAPELES Y GRAFICOS DE BC','PGB931215RJ4',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 19, 'PAPELES Y GRAFICOS DE BC', 'Av Miguel Jiménez Solis No. 970, Independencia, C.P.: 21290, Mexicali, Mexicali, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;




INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'RUBIO DE BC','RBC9412163K8',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 20, 'RUBIO DE BC', 'Carretera a San Luis  KM 7.5 No. S/N, González Ortega, C.P.: 21397, Mexicali, Mexicali, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;




INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'SMART & FINAL DEL NOROESTE','SFN930813CY7',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 21, 'SMART & FINAL DEL NOROESTE', 'Carretera Libre Tijuana Tecate No. 20481, El Florido I, C.P.: 22244, Tijuana, Tijuana, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;




INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'TRANSFRONTERIZO DNT','TDN230626F8A',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 22, 'TRANSFRONTERIZO DNT', 'Av. Industrial Puebla No. 22, Int. A, Puebla, C.P.: 21620, 01, Mexicali, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;



INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'TIENDAS SORIANA CEDIS','TSO991022PB6',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 23, 'TIENDAS SORIANA CEDIS', 'Av. de Todos los Santos No. 7560, Industrial Pacífico III, C.P.: 22643, Tijuana, Tijuana, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;






INSERT INTO `db_truck_manager`.`clientes`(`createDate`,`updateDate`,`nombre`,`rfc`,`active`)
SELECT NOW(),NOW(),'WALDOS DÓLAR MART DE MEXICO CEDIS TIJUANA','WDM990126350',1;

INSERT INTO `db_truck_manager`.`direcciones_clientes`(`createDate`,`updateDate`,`idCliente`,`nombre`,`direccion`,`latGPS`,`longGPS`,`active`)
SELECT NOW(), NOW(), 24, 'WALDOS DÓLAR MART DE MEXICO CEDIS TIJUANA', 'Av. Sur No. 5801, San Antonio Club Hípico y de Golf, C.P.: 22563, Tijuana, Tijuana, Baja California, México', '', '', 1;

SELECT * FROM clientes;
SELECT * FROM direcciones_clientes;






SELECT * FROM `db_truck_manager`.`choferes`


INSERT INTO `db_truck_manager`.`choferes`(`createDate`,`updateDate`,`nombre`,`RFC`,`domicilio`,
`noLicencia`,`expMedico`,`status`,`active`)
SELECT NOW(), NOW(), 'Jesus Enrique Armenta Armenta', 'AEAJ8802071I1', '', 'BC051214873', '', 1, 1;


INSERT INTO `db_truck_manager`.`choferes`(`createDate`,`updateDate`,`nombre`,`RFC`,`domicilio`,
`noLicencia`,`expMedico`,`status`,`active`)
SELECT NOW(), NOW(), 'Sosa Lopez Sergio Lazaro', 'SOLS661217C54', '', 'BCN0217328', '', 1, 1;

INSERT INTO `db_truck_manager`.`choferes`(`createDate`,`updateDate`,`nombre`,`RFC`,`domicilio`,
`noLicencia`,`expMedico`,`status`,`active`)
SELECT NOW(), NOW(), 'Sosa Lopez Sergio Lazaro', 'SOLS661217C54', '', 'BCN0217328', '', 1, 1;


SELECT * FROM `db_truck_manager`.`unidades`

INSERT INTO `db_truck_manager`.`unidades`(`createDate`,`updateDate`,`nombre`,`placas`,`espacios`,`active`)
SELECT NOW(), NOW(), 'Tracto Peterbilt Azul 2010', '36AL9S', 0, 1;

INSERT INTO `db_truck_manager`.`unidades`(`createDate`,`updateDate`,`nombre`,`placas`,`espacios`,`active`)
SELECT NOW(), NOW(), 'Internacional Blanco 2006', 'AN2224A', 0, 1;

INSERT INTO `db_truck_manager`.`unidades`(`createDate`,`updateDate`,`nombre`,`placas`,`espacios`,`active`)
SELECT NOW(), NOW(), 'Internacional Blanco Azul', 'ZJF703A', 0, 1;





