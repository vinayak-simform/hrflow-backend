# TICKET-07 Testing Guide

## Overview
Test the department deletion validation fix that prevents deleting departments with active employees assigned.

**Fixed Bug:** Departments could be deleted even when active employees were assigned, causing orphaned employee records.

**Fix:** Added referential integrity validation that throws `400 Bad Request` when attempting to delete a department with active employees.

---

## Test Environment Setup

### 1. Start the Server
```bash
cd /home/vinayak/Simform/ai-demo/hrflow-backend
npm run start:dev
# Server runs on: http://localhost:3000/api/v1
# Swagger docs: http://localhost:3000/api/docs
```

### 2. Seed Test Data
```bash
curl -X POST http://localhost:3000/api/v1/seed \
  -H "Content-Type: application/json"
```

**Response:** Returns credentials for hr_admin, managers, and employees. Save the `hr_admin` token for testing.

Example response:
```json
{
  "message": "Store seeded successfully",
  "users": [
    {
      "email": "admin@hrflow.com",
      "password": "Admin@123",
      "role": "hr_admin"
    },
    ...
  ]
}
```

### 3. Login as HR Admin
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@hrflow.com",
    "password": "Admin@123"
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "admin@hrflow.com",
    "role": "hr_admin"
  }
}
```

**⚠️ Important:** Copy the `accessToken` and use it as `YOUR_JWT_TOKEN` in all following requests.

---

## Test Cases

### ✅ Test 1: List All Departments
**Purpose:** View existing departments and their IDs.

```bash
curl -X GET http://localhost:3000/api/v1/departments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:** Array of departments (Engineering, Product, Sales, Marketing, HR).

```json
[
  {
    "id": "dept-uuid-1",
    "name": "Engineering",
    "description": "Software development team",
    "isActive": true,
    "createdAt": "2026-04-30T..."
  },
  ...
]
```

---

### ✅ Test 2: List All Employees
**Purpose:** See which employees are assigned to which departments.

```bash
curl -X GET http://localhost:3000/api/v1/employees \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:** Array of employees with their `departmentId` fields.

```json
[
  {
    "id": "emp-uuid-1",
    "firstName": "John",
    "lastName": "Doe",
    "departmentId": "dept-uuid-1",
    "isActive": true,
    ...
  },
  ...
]
```

---

### ❌ Test 3: Attempt to Delete Department WITH Active Employees (Should FAIL)
**Purpose:** Verify the fix prevents deletion when employees exist.

**Step 1:** Identify a department with active employees (e.g., "Engineering")

**Step 2:** Try to delete it:
```bash
curl -X DELETE http://localhost:3000/api/v1/departments/DEPARTMENT_ID_WITH_EMPLOYEES \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Response:** `400 Bad Request`
```json
{
  "statusCode": 400,
  "timestamp": "2026-04-30T12:34:56.789Z",
  "path": "/api/v1/departments/DEPARTMENT_ID_WITH_EMPLOYEES",
  "message": "Cannot delete department: 3 active employee(s) are still assigned to it. Please reassign or deactivate them before deleting this department."
}
```

**✅ PASS Criteria:**
- HTTP status is `400`
- Error message shows employee count
- Error message provides actionable guidance
- Department still exists in the database

---

### ✅ Test 4: Create a Department WITHOUT Employees
**Purpose:** Create a test department that has no employees assigned.

```bash
curl -X POST http://localhost:3000/api/v1/departments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Department",
    "description": "Temporary department for testing deletion"
  }'
```

**Expected Response:** `201 Created`
```json
{
  "id": "new-dept-uuid",
  "name": "Test Department",
  "description": "Temporary department for testing deletion",
  "isActive": true,
  "createdAt": "2026-04-30T..."
}
```

**Save the `id` from the response** for the next test.

---

### ✅ Test 5: Delete Department WITHOUT Employees (Should SUCCEED)
**Purpose:** Verify deletion works when no employees are assigned.

```bash
curl -X DELETE http://localhost:3000/api/v1/departments/NEW_DEPT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Response:** `200 OK`
```json
{
  "message": "Department deleted successfully."
}
```

**✅ PASS Criteria:**
- HTTP status is `200`
- Success message returned
- Department no longer appears in GET /departments

**Verify deletion:**
```bash
curl -X GET http://localhost:3000/api/v1/departments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

The "Test Department" should NOT be in the list.

---

### ❌ Test 6: Delete Non-Existent Department (Should FAIL)
**Purpose:** Verify proper error handling for invalid department IDs.

```bash
curl -X DELETE http://localhost:3000/api/v1/departments/invalid-uuid-12345 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Response:** `404 Not Found`
```json
{
  "statusCode": 404,
  "timestamp": "2026-04-30T12:34:56.789Z",
  "path": "/api/v1/departments/invalid-uuid-12345",
  "message": "Department invalid-uuid-12345 not found"
}
```

---

### ❌ Test 7: Unauthorized Access (Should FAIL)
**Purpose:** Verify endpoint is protected by authentication.

```bash
curl -X DELETE http://localhost:3000/api/v1/departments/SOME_DEPT_ID \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Response:** `401 Unauthorized`

---

### ❌ Test 8: Forbidden Access - Non HR Admin (Should FAIL)
**Purpose:** Verify only `hr_admin` role can delete departments.

**Step 1:** Login as a regular employee:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "emp1@hrflow.com",
    "password": "Emp1@123"
  }'
```

**Step 2:** Try to delete with employee token:
```bash
curl -X DELETE http://localhost:3000/api/v1/departments/SOME_DEPT_ID \
  -H "Authorization: Bearer EMPLOYEE_JWT_TOKEN" \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Response:** `403 Forbidden`

---

## Advanced Test Scenario: Reassign Then Delete

**Purpose:** Verify the complete workflow - transfer employees, then delete department.

### Step 1: Identify departments and employees
```bash
# Get departments
curl -X GET http://localhost:3000/api/v1/departments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get employees in a specific department (e.g., "Marketing")
curl -X GET http://localhost:3000/api/v1/employees \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  | jq '.[] | select(.departmentId == "MARKETING_DEPT_ID")'
```

### Step 2: Reassign all employees to another department
For each employee in the department:
```bash
curl -X PUT http://localhost:3000/api/v1/employees/EMPLOYEE_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "departmentId": "TARGET_DEPT_ID"
  }'
```

### Step 3: Verify no active employees remain
```bash
curl -X GET http://localhost:3000/api/v1/employees \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  | jq '.[] | select(.departmentId == "MARKETING_DEPT_ID" and .isActive == true)'
```

Should return empty array `[]`.

### Step 4: Delete the now-empty department
```bash
curl -X DELETE http://localhost:3000/api/v1/departments/MARKETING_DEPT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected:** `200 OK` with success message.

---

## Edge Cases to Test

### Edge Case 1: Department with ONLY Inactive Employees
**Purpose:** Verify inactive employees don't block deletion.

**Step 1:** Deactivate an employee:
```bash
curl -X PUT http://localhost:3000/api/v1/employees/EMPLOYEE_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": false
  }'
```

**Step 2:** If this was the last active employee in the department, deletion should now succeed:
```bash
curl -X DELETE http://localhost:3000/api/v1/departments/DEPT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected:** `200 OK` (inactive employees don't block deletion).

---

## Postman Collection Setup

### Import to Postman

1. **Create Environment Variables:**
   - `base_url` = `http://localhost:3000/api/v1`
   - `jwt_token` = (empty initially, set after login)
   - `dept_id_with_employees` = (set after viewing departments)
   - `dept_id_empty` = (set after creating test department)

2. **Collection Structure:**
   ```
   HRFlow API Tests
   ├── Auth
   │   ├── POST Seed Data
   │   ├── POST Login (HR Admin)
   │   └── POST Login (Employee)
   ├── Departments
   │   ├── GET List All Departments
   │   ├── POST Create Test Department
   │   ├── DELETE Dept WITH Employees (400)
   │   ├── DELETE Dept WITHOUT Employees (200)
   │   ├── DELETE Invalid Dept (404)
   │   └── DELETE Unauthorized (401)
   └── Employees
       ├── GET List All Employees
       └── PUT Update Employee Department
   ```

3. **Postman Request Template:**
   ```
   Method: DELETE
   URL: {{base_url}}/departments/{{dept_id_with_employees}}
   Headers:
     Authorization: Bearer {{jwt_token}}
   ```

4. **Automated Test Script (add to Tests tab):**
   ```javascript
   pm.test("Should return 400 Bad Request", function () {
       pm.response.to.have.status(400);
   });

   pm.test("Error message mentions employees", function () {
       const jsonData = pm.response.json();
       pm.expect(jsonData.message).to.include("active employee");
   });

   pm.test("Response has proper structure", function () {
       const jsonData = pm.response.json();
       pm.expect(jsonData).to.have.property("statusCode");
       pm.expect(jsonData).to.have.property("timestamp");
       pm.expect(jsonData).to.have.property("message");
   });
   ```

---

## Visual Testing with Swagger UI

Access Swagger at: **http://localhost:3000/api/docs**

1. Click **"Authorize"** button (top right)
2. Enter: `Bearer YOUR_JWT_TOKEN`
3. Navigate to **Departments** section
4. Expand **DELETE /api/v1/departments/{id}**
5. Click **"Try it out"**
6. Enter department ID
7. Click **"Execute"**

**Benefits:**
- Visual interface
- See all API responses documented
- No need to construct cURL commands manually
- Response examples shown for each status code

---

## Verification Checklist

- [ ] Seed data loaded successfully
- [ ] HR Admin can authenticate and get JWT
- [ ] GET /departments returns all departments
- [ ] GET /employees shows employees with departmentId
- [ ] DELETE department WITH employees returns `400`
- [ ] Error message shows employee count
- [ ] Error message is actionable (tells user what to do)
- [ ] Department still exists after failed deletion attempt
- [ ] New empty department can be created
- [ ] DELETE empty department returns `200`
- [ ] Department is removed after successful deletion
- [ ] DELETE non-existent department returns `404`
- [ ] DELETE without JWT returns `401`
- [ ] DELETE with non-admin role returns `403`
- [ ] Swagger docs show all response codes (200, 400, 401, 403, 404)
- [ ] Inactive employees don't block deletion

---

## Quick Copy-Paste Test Script

```bash
#!/bin/bash
# TICKET-07 Automated Test Script

BASE_URL="http://localhost:3000/api/v1"

echo "=== Step 1: Seed Data ==="
SEED_RESPONSE=$(curl -s -X POST $BASE_URL/seed -H "Content-Type: application/json")
echo $SEED_RESPONSE | jq .

echo -e "\n=== Step 2: Login as HR Admin ==="
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@hrflow.com", "password": "Admin@123"}')
JWT_TOKEN=$(echo $LOGIN_RESPONSE | jq -r .accessToken)
echo "JWT Token: ${JWT_TOKEN:0:20}..."

echo -e "\n=== Step 3: Get Departments ==="
DEPARTMENTS=$(curl -s -X GET $BASE_URL/departments \
  -H "Authorization: Bearer $JWT_TOKEN")
echo $DEPARTMENTS | jq .
DEPT_WITH_EMPLOYEES=$(echo $DEPARTMENTS | jq -r '.[0].id')
echo "Department ID: $DEPT_WITH_EMPLOYEES"

echo -e "\n=== Step 4: Try Delete Dept WITH Employees (Should FAIL) ==="
DELETE_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X DELETE $BASE_URL/departments/$DEPT_WITH_EMPLOYEES \
  -H "Authorization: Bearer $JWT_TOKEN")
echo $DELETE_RESPONSE

echo -e "\n=== Step 5: Create Empty Department ==="
NEW_DEPT=$(curl -s -X POST $BASE_URL/departments \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Dept", "description": "For testing"}')
echo $NEW_DEPT | jq .
NEW_DEPT_ID=$(echo $NEW_DEPT | jq -r .id)

echo -e "\n=== Step 6: Delete Empty Department (Should SUCCEED) ==="
DELETE_EMPTY=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X DELETE $BASE_URL/departments/$NEW_DEPT_ID \
  -H "Authorization: Bearer $JWT_TOKEN")
echo $DELETE_EMPTY

echo -e "\n=== Tests Complete ==="
```

**To run:**
```bash
chmod +x test-ticket-07.sh
./test-ticket-07.sh
```

---

## Expected Outcomes Summary

| Test Case | Expected Status | Expected Behavior |
|-----------|----------------|-------------------|
| Delete dept with employees | `400` | Error message with count + guidance |
| Delete empty department | `200` | Success message, dept removed |
| Delete non-existent dept | `404` | Department not found error |
| No authentication | `401` | Unauthorized error |
| Non-admin user | `403` | Forbidden error |
| Inactive employees only | `200` | Deletion succeeds |

---

## Troubleshooting

**Issue:** "Store has already been seeded"  
**Solution:** Restart the server to reset in-memory store.

**Issue:** JWT token expired  
**Solution:** Login again to get a new token.

**Issue:** Department ID not found  
**Solution:** Run GET /departments first to get valid IDs.

**Issue:** All tests passing but still seeing orphaned employees  
**Solution:** Check that you're testing with the fixed code, not old code.

---

## Contact

For questions about TICKET-07, contact the backend team or reference the implementation in:
- `src/modules/departments/departments.service.ts` (Line 42-56)
- `src/modules/departments/departments.controller.ts` (Line 44-63)
