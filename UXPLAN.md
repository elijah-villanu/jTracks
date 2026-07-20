# UX Structure Plan: Job Tracker Application

|--- 1. Navigation Flow
|   |--- Public Landing/Login
|   |--- Main Dashboard (Application Pipeline)
|   |   |--- Pipeline View (Spreadsheet/List Table)
|   |   |--- Analytics/Stats View
|   |--- Add New Job Action (Triggered via Modal)
|   |--- User Profile / Settings (Configurable Ghosting Thresholds)

|--- 2. Login Structure Page
|   |--- Header: Brand/Logo
|   |--- Main Container
|   |   |--- Title: "Track Your Career"
|   |   |--- Social Auth Buttons (Google/GitHub)
|   |   |--- Email/Password Input Fields
|   |   |--- Submit Button
|   |   |--- Footer Links (Terms/Privacy)

|--- 3. Dashboard Page Structure
|   |--- Header
|   |   |--- Logo
|   |   |--- Navigation Tabs (Tracker | Analytics | Profile)
|   |   |--- "Add Job" Primary Action Button
|   |--- Main Content Area
|   |   |--- Spreadsheet Toolbar (Filter by Status, Search Bar, Sort)
|   |   |--- Job Table
|   |   |   |--- Headers (Job Title, Company, Status, Date Applied, Next Steps)
|   |   |   |--- Row Item
|   |   |   |   |--- Status Pipeline Dropdown (Saved → Applied → Interviewing → Offer / Rejected / Ghosted)
|   |   |--- Ghosted Status Logic (Automatic flag based on configurable days)
|   |--- Analytics Dashboard
|   |   |--- Summary Cards (Total Applications, Interview Rate, Ghosting %)
|   |   |--- "Share Recap" Button (Generates Instagram-Stories-style image)

|--- 4. Add New Job Modal Structure
|   |--- Modal Overlay
|   |   |--- Title: "Track New Opportunity"
|   |   |--- Form Fields
|   |   |   |--- Company Name (Input)
|   |   |   |--- Job Title (Input)
|   |   |   |--- Job URL (Input)
|   |   |   |--- Initial Status (Dropdown: Saved / Applied)
|   |   |   |--- Date Applied (Date Picker)
|   |   |--- Footer Actions
|   |   |   |--- Cancel Button
|   |   |   |--- Save Application Button