const EthiopianDate = require('ethiopian-date');

// Convert Gregorian to Ethiopian
const toEthiopian = (gregorianDate) => {
  if (!gregorianDate) return null;
  
  const date = new Date(gregorianDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  const ethiopian = EthiopianDate.toEthiopian(year, month, day);
  
  return {
    year: ethiopian.year,
    month: ethiopian.month,
    day: ethiopian.day,
    formatted: `${ethiopian.day}/${ethiopian.month}/${ethiopian.year} E.C.`
  };
};

// Convert Ethiopian to Gregorian
const toGregorian = (ethiopianDate) => {
  if (!ethiopianDate) return null;
  
  const parts = ethiopianDate.split('/');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const year = parseInt(parts[2]);
  
  const gregorian = EthiopianDate.toGregorian(year, month, day);
  
  return `${gregorian.year}-${String(gregorian.month).padStart(2, '0')}-${String(gregorian.day).padStart(2, '0')}`;
};

// Get current Ethiopian date
const getCurrentEthiopianDate = () => {
  const now = new Date();
  return toEthiopian(now);
};

// Format Ethiopian date for display
const formatEthiopianDate = (gregorianDate) => {
  const ethiopian = toEthiopian(gregorianDate);
  return ethiopian ? ethiopian.formatted : null;
};

module.exports = {
  toEthiopian,
  toGregorian,
  getCurrentEthiopianDate,
  formatEthiopianDate
};