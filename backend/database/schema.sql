-- VoyBus / Contrato compartido v1.1 (esquema sin cambios de v1.0; uso compartido en paralelo)
-- SQLite 3. Indices y claves foraneas habilitadas en cada conexion.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL CHECK (role IN ('passenger', 'driver', 'admin')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS guest_sessions (
    id INTEGER PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS lines (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    color_hex TEXT NOT NULL CHECK (length(color_hex) = 7 AND color_hex GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled'))
);

CREATE TABLE IF NOT EXISTS stops (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY,
    line_id INTEGER NOT NULL REFERENCES lines(id),
    direction TEXT NOT NULL,
    start_label TEXT NOT NULL,
    end_label TEXT NOT NULL,
    service_days_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(service_days_json)),
    start_time_local TEXT NOT NULL,
    end_time_local TEXT NOT NULL,
    geometry_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(geometry_json)),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    UNIQUE (line_id, direction, start_label, end_label)
);

CREATE TABLE IF NOT EXISTS route_stops (
    id INTEGER PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    stop_id INTEGER NOT NULL REFERENCES stops(id),
    sequence INTEGER NOT NULL CHECK (sequence >= 1),
    UNIQUE (route_id, sequence)
);

CREATE TABLE IF NOT EXISTS favorite_stops (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stop_id INTEGER NOT NULL REFERENCES stops(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (user_id, stop_id)
);

CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    plate TEXT NOT NULL UNIQUE,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'operational' CHECK (status IN ('operational', 'operational_with_notes', 'maintenance', 'out_of_service')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY,
    driver_user_id INTEGER NOT NULL REFERENCES users(id),
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    planned_start_at TEXT NOT NULL,
    planned_end_at TEXT NOT NULL,
    actual_start_at TEXT,
    actual_end_at TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
    tolerance_minutes INTEGER NOT NULL DEFAULT 0 CHECK (tolerance_minutes >= 0),
    CHECK (planned_end_at > planned_start_at)
);

CREATE TABLE IF NOT EXISTS shift_trips (
    id INTEGER PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    route_id INTEGER NOT NULL REFERENCES routes(id),
    sequence INTEGER NOT NULL CHECK (sequence >= 1),
    planned_start_at TEXT NOT NULL,
    planned_end_at TEXT NOT NULL,
    CHECK (planned_end_at > planned_start_at),
    UNIQUE (shift_id, sequence)
);

CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY,
    shift_trip_id INTEGER NOT NULL UNIQUE REFERENCES shift_trips(id),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'finished', 'cancelled')),
    started_at TEXT,
    finished_at TEXT,
    last_passed_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_passed_sequence >= 0)
);

-- Instantanea de los paraderos del recorrido, fijada al iniciar el viaje.
CREATE TABLE IF NOT EXISTS trip_stops (
    id INTEGER PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence >= 1),
    stop_id INTEGER NOT NULL REFERENCES stops(id),
    stop_code_snapshot TEXT NOT NULL,
    stop_name_snapshot TEXT NOT NULL,
    latitude_snapshot REAL NOT NULL,
    longitude_snapshot REAL NOT NULL,
    UNIQUE (trip_id, sequence),
    UNIQUE (id, trip_id)
);

CREATE TABLE IF NOT EXISTS trip_locations (
    id INTEGER PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    accuracy_meters REAL CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
    sampled_at TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS trip_links (
    id INTEGER PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id),
    user_id INTEGER REFERENCES users(id),
    guest_session_id INTEGER REFERENCES guest_sessions(id),
    linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ended_at TEXT,
    CHECK ((user_id IS NOT NULL AND guest_session_id IS NULL) OR
           (user_id IS NULL AND guest_session_id IS NOT NULL)),
    UNIQUE (id, trip_id)
);

CREATE TABLE IF NOT EXISTS stop_requests (
    id INTEGER PRIMARY KEY,
    trip_id INTEGER NOT NULL,
    trip_link_id INTEGER NOT NULL,
    trip_stop_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'next', 'closed')),
    closure_reason TEXT CHECK (closure_reason IN ('stop_passed', 'trip_finished') OR closure_reason IS NULL),
    requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    closed_at TEXT,
    idempotency_key TEXT NOT NULL,
    FOREIGN KEY (trip_link_id, trip_id) REFERENCES trip_links(id, trip_id),
    FOREIGN KEY (trip_stop_id, trip_id) REFERENCES trip_stops(id, trip_id),
    UNIQUE (trip_link_id, idempotency_key),
    CHECK ((status = 'closed' AND closure_reason IS NOT NULL AND closed_at IS NOT NULL) OR
           (status <> 'closed' AND closure_reason IS NULL AND closed_at IS NULL))
);

-- Un aviso agrupado por paradero/trayecto; aumenta el conteo sin crear otra alerta sonora.
CREATE TABLE IF NOT EXISTS driver_alert_events (
    id INTEGER PRIMARY KEY,
    trip_id INTEGER NOT NULL,
    trip_stop_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'stop_request' CHECK (type = 'stop_request'),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (trip_stop_id, trip_id) REFERENCES trip_stops(id, trip_id),
    UNIQUE (trip_id, trip_stop_id, type)
);

-- Registro tecnico automatico para evitar sonidos duplicados tras reconexion.
CREATE TABLE IF NOT EXISTS driver_alert_deliveries (
    event_id INTEGER NOT NULL REFERENCES driver_alert_events(id) ON DELETE CASCADE,
    driver_user_id INTEGER NOT NULL REFERENCES users(id),
    seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (event_id, driver_user_id)
);

CREATE INDEX IF NOT EXISTS idx_routes_line ON routes(line_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_route_seq ON route_stops(route_id, sequence);
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_seq ON trip_stops(trip_id, sequence);
CREATE INDEX IF NOT EXISTS idx_shifts_driver_time ON shifts(driver_user_id, planned_start_at, planned_end_at);
CREATE INDEX IF NOT EXISTS idx_shifts_vehicle_time ON shifts(vehicle_id, planned_start_at, planned_end_at);
CREATE INDEX IF NOT EXISTS idx_shift_trips_shift ON shift_trips(shift_id, sequence);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_locations_trip_time ON trip_locations(trip_id, sampled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_requests_trip_stop_status ON stop_requests(trip_id, trip_stop_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_link_user ON trip_links(user_id) WHERE ended_at IS NULL AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_link_guest ON trip_links(guest_session_id) WHERE ended_at IS NULL AND guest_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_request_link ON stop_requests(trip_link_id) WHERE status IN ('sent', 'next');
-- Regla de una sola carrera activa por conductor o vehiculo: transaccion de servicio, no solo indice.
-- Regla de turnos que se solapan: validacion transaccional antes de INSERT/UPDATE (incluye fin exclusivo).
