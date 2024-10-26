
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

