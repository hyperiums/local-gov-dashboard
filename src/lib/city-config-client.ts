// Client-safe city configuration
// This module provides config values that can be used in both server and client components
// Values are read from city-config.json at build time via Next.js

import configJson from '../../city-config.json';

export const cityConfig = configJson;

// Convenience getters
export const cityName = configJson.city.name;
export const cityState = configJson.city.state;
export const cityStateAbbrev = configJson.city.stateAbbrev;
export const cityAddress = configJson.city.address;
export const cityPhone = configJson.city.phone;
export const meetingSchedule = configJson.city.meetingSchedule;
export const cityTimezone = configJson.city.timezone;
export const civicClerkUrl = configJson.urls.civicClerk;
export const cityWebsiteUrl = configJson.urls.cityWebsite;
export const municodeUrl = configJson.urls.municode;
export const clearGovBudgetUrl = configJson.urls.clearGovBudget;
export const clearGovSpendingBaseUrl = configJson.urls.clearGovSpending;
export const contactEmail = configJson.contact.email;

// Full location string for display
export const cityLocation = `${configJson.city.name}, ${configJson.city.stateAbbrev}`;
