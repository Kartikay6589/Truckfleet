/* Convert snake_case DB rows to the camelCase shape the frontend already
   expects (it used to read these straight out of localStorage). */

function user(row) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.created_at
  };
}

function vehicle(row) {
  return {
    id: row.id,
    userId: row.user_id,
    vehicleNumber: row.vehicle_number,
    ownerName: row.owner_name,
    driverName: row.driver_name,
    vehicleType: row.vehicle_type,
    addedAt: row.added_at
  };
}

function driver(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    license: row.license,
    lastSalary: row.last_salary,
    lastSalaryDate: row.last_salary_date,
    isSalaryPaid: !!row.is_salary_paid,
    addedAt: row.added_at
  };
}

function trip(row) {
  return {
    id: row.id,
    userId: row.user_id,
    vehicleId: row.vehicle_id,
    vehicleNumber: row.vehicle_number,
    vehicleType: row.vehicle_type,
    from: row.from_loc,
    to: row.to_loc,
    cycleOrigin: row.cycle_origin,
    originalTotal: row.original_total,
    tdsPercent: row.tds_percent,
    tdsAmount: row.tds_amount,
    gstType: row.gst_type,
    gstPercent: row.gst_percent,
    gstAmount: row.gst_amount,
    total: row.total,
    advance: row.advance,
    balance: row.balance,
    paid: !!row.paid,
    paidAt: row.paid_at,
    fuelExpense: row.fuel_expense,
    tollExpense: row.toll_expense,
    driverExpense: row.driver_expense,
    registeredAt: row.registered_at
  };
}

function brokerTrip(row) {
  return {
    id: row.id,
    userId: row.user_id,
    company: row.company,
    owner: row.owner,
    vehicleNumber: row.vehicle_number,
    from: row.from_loc,
    to: row.to_loc,
    purchase: row.purchase,
    sell: row.sell,
    date: row.date
  };
}

function notification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    message: row.message,
    time: row.time
  };
}

module.exports = { user, vehicle, driver, trip, brokerTrip, notification };
