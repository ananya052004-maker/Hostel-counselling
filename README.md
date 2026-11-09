# 🏨 VIT Hostel Guide & Counselling Simulator

A web-based hostel exploration and counselling simulation platform designed for **VIT Vellore students**. The application helps students explore hostel facilities, compare room types, register their details, rank hostel preferences, and estimate their hostel allocation based on a branch-priority and CGPA-based allocation algorithm.

The platform combines an interactive hostel directory with a backend-driven counselling engine to make the hostel selection process more transparent and convenient.

---

## ✨ Key Features

### 1. Hostel Exploration
- Browse men's hostels, women's hostels, or all available hostels.
- Explore hostel blocks with images and detailed information.
- Filter hostels based on room capacity (1, 2, 3, 4, and 6 sharing).
- Filter by accommodation type (Hostel and Apartment).
- Search hostels using block codes or hostel names.
- View detailed hostel information, including:
  - Room availability and room configurations.
  - AC and Non-AC accommodation.
  - Mess information.
  - Contact details.
  - Hostel photographs and image galleries.

### 2. Student Registration & Authentication
- Register using student details.
- Capture essential information such as:
  - Name
  - Registration Number
  - Email
  - Gender
  - CGPA
  - Academic Branch
- Login using the registered email address.
- Maintain authenticated sessions using token-based authentication.

### 3. Hostel Preference Counselling
- Select and rank up to 8 hostel and room-type preferences.
- Submit preferences in priority order.
- Validate hostel selections and room-type availability.
- Update preferences while waiting for allocation.

### 4. Intelligent Hostel Allocation Engine
- Implements a **Serial Dictatorship Allocation Algorithm**.
- Prioritizes students based on branch strength and CGPA.
- Processes students in branch-priority order.
- Uses CGPA as a tie-breaker within the same branch.
- Assigns the highest-ranked available hostel preference.
- Prevents seat over-allocation using database transactions.
- Supports waitlisting when preferred choices are unavailable.

### 5. Live Allocation Prediction
- Provides real-time allocation estimates before the official counselling round.
- Displays the student's likely allocation outcome.
- Shows the status of every ranked preference:
  - `Would Get` – The preference is currently available for allocation.
  - `Full` – Available seats have been consumed by students with equal or higher priority.
  - `Not Reached` – A higher-ranked preference has already been selected.

### 6. Admin Counselling Management
- Secure admin-only allocation execution.
- Run counselling rounds through protected API endpoints.
- View aggregate counselling statistics.
- Track total registrations, allocations, waitlisted students, and seat utilization.

### 7. User Interface
- Responsive and interactive interface.
- Dark mode with preference persistence.
- Hostel image galleries.
- Dynamic allocation status updates.

---

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js, Express.js |
| Database | SQLite |
| Database Library | Better-SQLite3 |
| Build Tool | Vite |
| Authentication | Token-based session authentication |
| API | RESTful APIs |
| Development Tools | Git, GitHub, VS Code |

---

## 🏗️ System Architecture

The application follows a client-server architecture.

```text
             STUDENT
                |
                v
       FRONTEND APPLICATION
        HTML / CSS / JS
                |
                v
          EXPRESS SERVER
                |
        +-------+-------+
        |       |       |
        v       v       v
     Hostel   Auth   Counselling
     Routes   Routes   Routes
        |       |       |
        +-------+-------+
                |
                v
        ALLOCATION ENGINE
                |
                v
          SQLITE DATABASE
                |
        +-------+--------+
        |                |
        v                v
   Student Data     Seat Usage
   Preferences      Allocations
```

### Application Workflow

1. Students explore hostel details.
2. Students register or log in.
3. Students submit their ranked hostel preferences.
4. The backend evaluates the submitted preferences.
5. The allocation engine calculates a live allocation estimate.
6. An administrator initiates the actual counselling round.
7. The system assigns available seats based on priority.
8. Students view their final allocation or waitlist status.

---

## ⚙️ Allocation Algorithm

The project implements a simplified version of a branch-priority-based serial dictatorship algorithm.

### Priority Rules

1. Students are grouped according to their academic branch.
2. Branches with smaller estimated student strengths receive higher priority.
3. Within the same branch, students with higher CGPA receive priority.
4. Each student is assigned their highest-ranked hostel preference with available capacity.
5. Students who cannot secure any ranked preference are waitlisted.

### Example

Consider the following students:

| Student | Branch | CGPA |
|---|---|---:|
| Student A | CSE | 9.2 |
| Student B | ECE | 9.5 |
| Student C | CSE | 8.9 |

The system first considers the branch priority. Within CSE, Student A is processed before Student C because of the higher CGPA.

**Important:** The branch-strength values used in this project are indicative simulation values, not officially verified VIT admission figures. The allocation results are estimates and should not be treated as official hostel allotments.

---

## 📂 Project Structure

```text
Hostel-counselling/
│
├── data/
│   └── hostels.db
│
├── lib/
│   ├── allocate.js
│   └── auth.js
│
├── routes/
│   ├── auth.js
│   ├── hostels.js
│   └── counselling.js
│
├── src/
│   ├── main.js
│   ├── styles.css
│   └── data.js
│
├── index.html
├── server.js
├── db.js
├── package.json
├── vite.config.js
├── render.yaml
└── README.md
```

---

## 🚀 Getting Started

Follow these instructions to run the project locally.

### Prerequisites

Make sure you have installed:

- Node.js
- npm
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/ananya052004-maker/Hostel-counselling.git
```

### 2. Navigate to the Project Directory

```bash
cd Hostel-counselling
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Development Server

```bash
ADMIN_KEY=dev-secret npm run dev
```

The frontend will be available at:

```text
http://localhost:5173
```

The Express backend runs on port `3001` by default.

**Note:** The `ADMIN_KEY` environment variable is required only for admin allocation and statistics endpoints.

### 5. Production Build

Build the frontend:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

---

## 🔗 API Endpoints

The application exposes REST APIs for hostel management, authentication, counselling, and allocation.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/hostels` | Retrieve hostel listings |
| GET | `/api/hostels/:code` | Retrieve hostel details |
| GET | `/api/branches` | Retrieve branch information |
| POST | `/api/auth/identify` | Identify registered students |
| POST | `/api/auth/register` | Register a new student |
| GET | `/api/auth/me` | Retrieve authenticated student |
| POST | `/api/preferences` | Submit hostel preferences |
| GET | `/api/allocation/me` | Retrieve final allocation status |
| GET | `/api/allocation/preview` | Generate live allocation estimate |
| GET | `/api/hostels/:code/availability` | Check room availability |
| POST | `/api/admin/run-allocation` | Execute counselling allocation |
| GET | `/api/admin/stats` | Retrieve counselling statistics |

Admin endpoints require the `x-admin-key` request header.

---

## 🔐 Security & Limitations

- Student authentication uses session tokens.
- Administrative operations are protected using an environment-configured admin key.
- Admin credentials are not exposed through frontend code.
- The current email-based login does not include password or email verification. It is intended for demonstration purposes, not production authentication.
- Hostel room counts are indicative placeholders and should be verified through official VIT sources.
- Branch-strength values are simulation data and may not represent actual student intake.

---

## 🔮 Future Enhancements

- Integrate official hostel availability data.
- Implement OTP-based email authentication.
- Add student dashboards and allocation history.
- Introduce advanced hostel recommendation features.
- Add real-time notifications for counselling updates.
- Develop a comprehensive admin dashboard.
- Improve allocation predictions using verified historical counselling data.
- Add automated testing and enhanced deployment monitoring.

---

## 🎯 Project Objective

The primary objective of this project is to simplify hostel exploration and make the counselling process more transparent through an interactive platform and an algorithm-driven allocation simulation.

By combining hostel information, preference ranking, priority-based allocation, and live prediction, the application provides students with a practical way to understand and prepare for hostel counselling.

---

## 👩‍💻 Author

**Ananya Jain**

- GitHub: [@ananya052004-maker](https://github.com/ananya052004-maker)
- Project Repository: [Hostel Counselling](https://github.com/ananya052004-maker/Hostel-counselling)

---

⭐ If you find this project useful, consider giving the repository a star!
