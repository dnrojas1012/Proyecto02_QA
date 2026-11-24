-- =====================================================================
-- Gimnasio Seguro - Esquema de base de datos (PostgreSQL)
-- Proyecto 2 ISW-622 Pruebas de Software
-- Ejecutar sobre una base vacía llamada gimnasio_seguro.
-- =====================================================================

DROP TABLE IF EXISTS asistencias, membresias, clientes, bitacora,
                     usuarios, rol_permiso, permisos, roles, session CASCADE;
DROP SEQUENCE IF EXISTS membresias_codigo_seq;

-- ---------- Seguridad: roles y permisos (UTN-05, UTN-06) -------------
CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(50)  NOT NULL UNIQUE,
    descripcion VARCHAR(200) NOT NULL DEFAULT '',
    es_sistema  BOOLEAN      NOT NULL DEFAULT FALSE  -- SuperAdmin, Auditor y Recepción no se borran
);

CREATE TABLE permisos (
    id     SERIAL PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL UNIQUE,   -- CREAR, EDITAR, BORRAR, VER_REPORTES
    nombre VARCHAR(60) NOT NULL
);

-- Los permisos se asignan a ROLES, nunca a usuarios (UTN-05)
CREATE TABLE rol_permiso (
    rol_id     INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permiso_id INT NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
    PRIMARY KEY (rol_id, permiso_id)
);

-- ---------- Usuarios (UTN-02, UTN-04) --------------------------------
CREATE TABLE usuarios (
    id             SERIAL PRIMARY KEY,
    username       VARCHAR(30)  NOT NULL UNIQUE,
    identificacion VARCHAR(20)  NOT NULL UNIQUE,
    nombre         VARCHAR(100) NOT NULL,
    correo         VARCHAR(120) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,          -- Argon2id, nunca la contraseña
    rol_id         INT NOT NULL REFERENCES roles(id),
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_login   TIMESTAMPTZ,
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- Bitácora de auditoría (UTN-09) ---------------------------
CREATE TABLE bitacora (
    id         BIGSERIAL PRIMARY KEY,
    fecha      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    evento     VARCHAR(40)  NOT NULL,   -- LOGIN_OK, LOGIN_FALLIDO, ACCESO_DENEGADO, CAMBIO_ROL, ...
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    username   VARCHAR(30),             -- se guarda aparte por si el usuario se borra
    ip         VARCHAR(64),
    ruta       VARCHAR(255),
    detalle    VARCHAR(500)
);
CREATE INDEX ix_bitacora_fecha ON bitacora (fecha DESC);

-- ---------- Dominio: gimnasio y membresías ---------------------------
CREATE TABLE clientes (
    id                    SERIAL PRIMARY KEY,
    cedula                VARCHAR(20)  NOT NULL UNIQUE,
    nombre                VARCHAR(100) NOT NULL,
    telefono              VARCHAR(20)  NOT NULL,
    emergencia_nombre     VARCHAR(100) NOT NULL,   -- dato sensible
    emergencia_telefono   VARCHAR(20)  NOT NULL,   -- dato sensible
    creado_en             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- El código se genera solo: MEM-1000, MEM-1001, ...
CREATE SEQUENCE membresias_codigo_seq START 1000;

CREATE TABLE membresias (
    id                SERIAL PRIMARY KEY,
    codigo            VARCHAR(20)   NOT NULL UNIQUE DEFAULT ('MEM-' || nextval('membresias_codigo_seq')),
    cliente_id        INT           NOT NULL REFERENCES clientes(id),
    plan              VARCHAR(12)   NOT NULL CHECK (plan IN ('MENSUAL','TRIMESTRAL','ANUAL')),
    fecha_inicio      DATE          NOT NULL,
    fecha_vencimiento DATE          NOT NULL,
    monto             NUMERIC(10,2) NOT NULL CHECK (monto > 0),          -- RN-3.3
    renovada_de       INT REFERENCES membresias(id),
    creado_por        INT REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CHECK (fecha_vencimiento >= fecha_inicio)
);
CREATE INDEX ix_membresias_cliente ON membresias (cliente_id);
CREATE INDEX ix_membresias_vencimiento ON membresias (fecha_vencimiento);

CREATE TABLE asistencias (
    id             SERIAL PRIMARY KEY,
    cliente_id     INT  NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    membresia_id   INT  NOT NULL REFERENCES membresias(id) ON DELETE CASCADE,
    fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
    hora           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registrado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT uq_asistencia_cliente_dia UNIQUE (cliente_id, fecha)   -- RN-3.2
);

-- ---------- Sesiones (las guarda express-session / connect-pg-simple) -
CREATE TABLE session (
    sid    VARCHAR      NOT NULL PRIMARY KEY,
    sess   JSON         NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX ix_session_expire ON session (expire);
