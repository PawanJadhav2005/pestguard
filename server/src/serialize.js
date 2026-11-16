// The ONLY place a customer row is turned into an API response.
// The mobile number is added for admins only, so the call center and technicians
// can never receive it (not in lists, details, search, exports or job payloads).
function customerOut(c, role) {
  if (!c) return null;
  const out = {
    id: c.id, ref: c.ref, name: c.name, address: c.address, area: c.area,
    propertyType: c.property_type, notes: c.notes ?? null
  };
  if (role === 'admin') out.mobile = c.mobile;
  return out;
}
module.exports = { customerOut };
