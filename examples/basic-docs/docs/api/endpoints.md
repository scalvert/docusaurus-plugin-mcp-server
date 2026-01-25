---
sidebar_position: 2
---

# API Endpoints

Reference documentation for all available API endpoints.

## Users

### List Users

Retrieve a paginated list of users.

```http
GET /v1/users
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page (max 100) |
| `status` | string | - | Filter by status: `active`, `inactive` |

**Example Request:**

```bash
curl https://api.example.com/v1/users?limit=10 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "user_123",
      "email": "john@example.com",
      "name": "John Doe",
      "status": "active",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42
  }
}
```

### Get User

Retrieve a single user by ID.

```http
GET /v1/users/:id
```

**Example Request:**

```bash
curl https://api.example.com/v1/users/user_123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Create User

Create a new user.

```http
POST /v1/users
```

**Request Body:**

```json
{
  "email": "jane@example.com",
  "name": "Jane Smith",
  "role": "member"
}
```

**Example Request:**

```bash
curl -X POST https://api.example.com/v1/users \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@example.com", "name": "Jane Smith"}'
```

### Update User

Update an existing user.

```http
PATCH /v1/users/:id
```

### Delete User

Delete a user.

```http
DELETE /v1/users/:id
```

## Projects

### List Projects

```http
GET /v1/projects
```

### Create Project

```http
POST /v1/projects
```

**Request Body:**

```json
{
  "name": "My Project",
  "description": "A sample project"
}
```

## Error Handling

All endpoints return errors in a consistent format:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The request was invalid",
    "details": {
      "field": "email",
      "issue": "Invalid email format"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `unauthorized` | 401 | Invalid or missing API key |
| `forbidden` | 403 | Insufficient permissions |
| `not_found` | 404 | Resource not found |
| `invalid_request` | 400 | Invalid request parameters |
| `rate_limited` | 429 | Too many requests |
| `server_error` | 500 | Internal server error |

## Rate Limiting

API requests are limited to:

- **100 requests per minute** for standard plans
- **1000 requests per minute** for enterprise plans

Rate limit headers are included in all responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067200
```
