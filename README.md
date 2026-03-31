# 💧 Anjani Water - Delivery & Operations Management System

An enterprise-grade, offline-first web application built to manage daily operations, deliveries, payments, and leads for Anjani Water (Packaged Drinking Water).

## ✨ Core Features

* **📦 Order & Delivery Management:** Create, edit, and track daily water deliveries.
* **💳 Payment Tracking:** Record cash/online payments and auto-calculate customer outstanding balances.
* **🏭 Stock Management:** Track daily production vs. deliveries with real-time inventory health indicators.
* **👥 Customer CRM:** Manage active/inactive clients, flag overdue accounts, and generate PDF account statements.
* **🎯 Lead Management:** Track new inquiries, convert leads to customers, and schedule follow-ups.
* **📱 WhatsApp Integration:** One-click WhatsApp messaging for delivery confirmations, payment receipts, and marketing templates.

---

## 🏗️ Architecture: The Central Sync Engine

This app utilizes an **Offline-First, Optimistic UI** architecture (similar to modern apps like WhatsApp or Trello). It is designed to be 100% immune to network drops, ensuring delivery staff never have to wait for a loading spinner while on the road.

All data mutations (Saves, Edits, Deletes) are routed through a central master file (`src/engine.js`). 

### The Data Flow (`dispatch`):
1. **Memory Update:** Data is instantly updated in the local `DB` object.
2. **Cache Lock:** The updated `DB` is immediately serialized and saved to the device's LocalStorage.
3. **UI Render:** The screen is instantly redrawn to reflect the changes (Optimistic UI).
4. **Background Sync:** The engine quietly communicates with the Firebase backend to sync the data. If the device is offline, the payload is pushed to a background queue (`sync.js`) to be processed automatically when the connection is restored.

---

## 📁 Core File Structure

* **`/src/engine.js`**: The brain of the app. Handles all routing, local caching, and Firebase syncing (`dispatch` function).
* **`/src/sync.js`**: The background worker. Manages the offline queue and handles retries when the internet connection drops.
* **`/src/state.js`**: Holds the global `DB` arrays (orders, customers, stock, etc.) and environment configurations.
* **`/src/orders.js`**: UI logic for the Orders/Pending Deliveries tab.
* **`/src/payments.js`**: UI logic for the Payments and Account Statements tab.
* **`/src/customers.js`**: UI logic for the Client CRM and location mapping.
* **`/src/stock.js`**: UI logic for the Production & Inventory tab.
* **`/src/leads.js`**: UI logic for the Sales & Lead management tab.

---

## 🛠️ Technology Stack

* **Frontend:** Vanilla JavaScript (ES6 Modules), HTML5, Tailwind CSS.
* **Icons:** Feather Icons.
* **Backend / Database:** Firebase (via custom `window.FirebaseAPI` wrapper).
* **Maps:** Google Maps Places API (for address autocomplete and geolocation).

---

## 🚀 Future Roadmap

* [ ] Push Notifications for new leads.
* [ ] Automated daily summary reports via email.
* [ ] Advanced routing/map optimization for delivery staff.

---
*Built for Anjani Water, Vadodara.*# AnjaniNew
