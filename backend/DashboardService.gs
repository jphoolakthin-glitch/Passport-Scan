/**
 * DashboardService.gs — summary for the Dashboard page (flowchart step 4).
 */
function dashboardSummary_(payload, ctx) {
  const hotels = allHotels_().filter(function (h) { return h.active && canAccessHotel_(ctx, h.hotel_id); });
  const visible = {};
  hotels.forEach(function (h) { visible[h.hotel_id] = h.name; });

  const byType = {};
  const byStatus = {};
  ENUMS.asset_type.forEach(function (t) { byType[t] = 0; });
  ENUMS.asset_status.forEach(function (s) { byStatus[s] = 0; });
  const today = todayDate_();
  const windowDays = alertDaysBefore_();
  const expiring = [];
  let total = 0;

  repo_('assets').all().forEach(function (a) {
    if (!(a.hotel_id in visible)) return;
    total++;
    byType[a.type] = (byType[a.type] || 0) + 1;
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    if (a.license_expiry && a.status !== 'RETIRED') {
      const days = daysBetween_(today, a.license_expiry);
      if (days <= windowDays) {
        expiring.push({
          asset_id: a.asset_id, name: a.name, type: a.type, hotel_id: a.hotel_id, hotel_name: visible[a.hotel_id],
          license_name: a.license_name, license_expiry: a.license_expiry, days_left: days,
        });
      }
    }
  });
  expiring.sort(function (a, b) { return a.days_left - b.days_left; });

  const openAlerts = repo_('alerts').findBy('status', 'OPEN').filter(function (a) { return a.hotel_id in visible; }).length;

  return {
    hotels: hotels.length,
    assets: total,
    byType: byType,
    byStatus: byStatus,
    openAlerts: openAlerts,
    alertDaysBefore: windowDays,
    expiring: expiring.slice(0, 20),
    expiringTotal: expiring.length,
  };
}
