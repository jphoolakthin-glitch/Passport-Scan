/**
 * Schema.gs — the sheet schema (v1). This is the contract shared with any
 * later platform: 1 sheet = 1 table, snake_case headers, UUID keys,
 * ISO dates, plain-text cells, JSON for structured values.
 *
 * Column types: string | bool | int | date (YYYY-MM-DD) | datetime (ISO 8601) | json
 * See docs/schema.md for the human-readable version.
 */
const ENUMS = {
  asset_type: ['PC', 'SCANNER', 'SERVER'],
  asset_status: ['ACTIVE', 'REPAIR', 'INACTIVE', 'RETIRED'],
  alert_type: ['LICENSE_EXPIRING', 'LICENSE_EXPIRED'],
  alert_status: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'],
};

const SCHEMA = {
  users: {
    file: 'data', key: 'email',
    columns: [
      ['email', 'string'], ['name', 'string'], ['role', 'string'], ['active', 'bool'],
      ['created_at', 'datetime'], ['updated_at', 'datetime'],
    ],
  },
  role_permissions: {
    file: 'data', key: 'id',
    columns: [['id', 'string'], ['role', 'string'], ['action', 'string']],
  },
  user_hotels: {
    file: 'data', key: 'id',
    // hotel_id '*' = every hotel
    columns: [['id', 'string'], ['user_email', 'string'], ['hotel_id', 'string']],
  },
  hotels: {
    file: 'data', key: 'hotel_id',
    columns: [
      ['hotel_id', 'string'], ['code', 'string'], ['name', 'string'], ['province', 'string'],
      ['address', 'string'], ['contact_name', 'string'], ['contact_phone', 'string'],
      ['active', 'bool'], ['created_at', 'datetime'], ['updated_at', 'datetime'],
    ],
  },
  assets: {
    file: 'data', key: 'asset_id',
    columns: [
      ['asset_id', 'string'], ['hotel_id', 'string'], ['type', 'string'], ['name', 'string'],
      ['brand', 'string'], ['model', 'string'], ['serial_number', 'string'],
      ['ip_address', 'string'], ['location', 'string'], ['status', 'string'],
      ['license_name', 'string'], ['license_expiry', 'date'], ['notes', 'string'],
      ['created_at', 'datetime'], ['created_by', 'string'],
      ['updated_at', 'datetime'], ['updated_by', 'string'],
    ],
  },
  alerts: {
    file: 'data', key: 'alert_id',
    columns: [
      ['alert_id', 'string'], ['created_at', 'datetime'], ['asset_id', 'string'], ['hotel_id', 'string'],
      ['alert_type', 'string'], ['license_expiry', 'date'], ['days_left', 'int'], ['message', 'string'],
      ['status', 'string'], ['updated_at', 'datetime'], ['updated_by', 'string'],
    ],
  },
  audit_log: {
    file: 'audit', key: 'audit_id',
    columns: [
      ['audit_id', 'string'], ['timestamp', 'datetime'], ['user_email', 'string'], ['action', 'string'],
      ['entity', 'string'], ['entity_id', 'string'], ['before', 'json'], ['after', 'json'],
      ['request_id', 'string'],
    ],
  },
};

/** Default roles. Role names and permissions are still [Open] in the brief — edit role_permissions to change. */
const DEFAULT_ROLE_PERMISSIONS = {
  admin: ['*'],
  editor: [
    'dashboard.summary', 'hotels.search', 'hotels.get', 'assets.list', 'assets.get', 'assets.save',
    'alerts.list', 'alerts.update',
  ],
  viewer: ['dashboard.summary', 'hotels.search', 'hotels.get', 'assets.list', 'assets.get', 'alerts.list'],
};

function columnNames_(table) {
  return SCHEMA[table].columns.map(function (c) { return c[0]; });
}
