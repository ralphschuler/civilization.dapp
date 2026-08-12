const scalarString = (value) => typeof value === 'string' ? value : undefined;

/**
 * Return the small, safe subset of an IDKit failure suitable for user-visible
 * diagnostics. Deliberately never copy request/response payloads.
 */
export function sanitizeWorldIdDiagnostic(errorCode, debugReport) {
  const report = debugReport && typeof debugReport === 'object' ? debugReport : {};
  const miniApp = report.mini_app && typeof report.mini_app === 'object' ? report.mini_app : {};
  const response = report.response_payload && typeof report.response_payload === 'object' ? report.response_payload : {};

  return Object.fromEntries(Object.entries({
    errorCode: scalarString(errorCode),
    packageVersion: scalarString(report.package_version),
    debugReportVersion: scalarString(report.version),
    transport: scalarString(report.transport),
    platform: scalarString(miniApp.platform),
    sendChannel: scalarString(miniApp.send_channel),
    responseChannel: scalarString(miniApp.response_channel),
    requestId: scalarString(report.request_id),
    responseErrorCode: scalarString(response.error_code),
  }).filter(([, value]) => value !== undefined));
}

export function formatWorldIdDiagnostic(diagnostic) {
  const labels = {
    errorCode: 'Fehlercode',
    responseErrorCode: 'Antwortcode',
    packageVersion: 'IDKit',
    debugReportVersion: 'Berichtsversion',
    transport: 'Transport',
    platform: 'Plattform',
    sendChannel: 'Sendekanal',
    responseChannel: 'Antwortkanal',
    requestId: 'Anfrage-ID',
  };
  const details = Object.entries(diagnostic).map(([key, value]) => `${labels[key]}: ${value}`);
  return details.length ? details.join(' · ') : 'Fehlercode: world_id_failed';
}
