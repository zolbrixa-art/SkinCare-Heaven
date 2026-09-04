import os
import json
import sqlite3
from datetime import datetime
from functools import wraps

from flask import Flask, jsonify, request, session, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "skincare.db")
app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-this-secret-key")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@skincareheaven.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@123")
CATEGORIES = ("Cleansers", "Moisturizers", "Serums", "Sunscreens")
PKR_CONVERSION = 280


def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with get_db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                address TEXT NOT NULL,
                items_json TEXT NOT NULL,
                total REAL NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            );
            CREATE TABLE IF NOT EXISTS contact_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                category TEXT NOT NULL,
                image TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            """
        )
        admin = connection.execute("SELECT id FROM admin_users WHERE email = ?", (ADMIN_EMAIL,)).fetchone()
        if admin is None:
            connection.execute(
                "INSERT INTO admin_users (email, password_hash) VALUES (?, ?)",
                (ADMIN_EMAIL, generate_password_hash(ADMIN_PASSWORD)),
            )
        if connection.execute("SELECT COUNT(*) AS count FROM products").fetchone()["count"] == 0:
            products = [
                ("Moisturizing Cream", 5600, "Moisturizers", "images/moisturizer.jpg"),
                ("Night Repair Cream", 9800, "Moisturizers", "images/night-cream.jpg"),
                ("Anti-Aging Serum", 11200, "Serums", "images/anti-aging-serum.jpg"),
                ("Vitamin C Lotion", 8400, "Serums", "images/vitamin-c-lotion.jpg"),
                ("Facial Cleanser", 4200, "Cleansers", "images/facial-cleanser.jpg"),
                ("Gentle Exfoliator", 6160, "Cleansers", "images/exfoliator.jpg"),
                ("Sunscreen SPF 50", 7000, "Sunscreens", "images/sunscreen.jpg"),
                ("Daily UV Shield", 7840, "Sunscreens", "images/sunscreens.jfif"),
            ]
            connection.executemany(
                "INSERT INTO products (name, price, category, image, created_at) VALUES (?, ?, ?, ?, ?)",
                [(name, price, category, image, datetime.utcnow().isoformat()) for name, price, category, image in products],
            )
        else:
            seeded_prices = {
                "Moisturizing Cream": 5600,
                "Night Repair Cream": 9800,
                "Anti-Aging Serum": 11200,
                "Vitamin C Lotion": 8400,
                "Facial Cleanser": 4200,
                "Gentle Exfoliator": 6160,
                "Sunscreen SPF 50": 7000,
                "Daily UV Shield": 7840,
            }
            for name, price in seeded_prices.items():
                connection.execute(
                    "UPDATE products SET price = ? WHERE name = ? AND price > 100000",
                    (price, name),
                )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Please log in before continuing."}), 401
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "admin_id" not in session:
            return jsonify({"error": "Admin login required."}), 401
        return view(*args, **kwargs)

    return wrapped


@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "auth.html")


@app.post("/api/signup")
def signup():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if not name or not email or len(password) < 6:
        return jsonify({"error": "Name, valid email, and a 6-character password are required."}), 400

    try:
        with get_db() as connection:
            cursor = connection.execute(
                "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (name, email, generate_password_hash(password), datetime.utcnow().isoformat()),
            )
            session["user_id"] = cursor.lastrowid
            session["user_name"] = name
    except sqlite3.IntegrityError:
        return jsonify({"error": "An account with this email already exists."}), 409
    return jsonify({"message": "Account created successfully.", "name": name})


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    with get_db() as connection:
        admin = connection.execute("SELECT * FROM admin_users WHERE email = ?", (email,)).fetchone()
        if admin is not None and check_password_hash(admin["password_hash"], password):
            session.clear()
            session["admin_id"] = admin["id"]
            return jsonify({"message": "Admin login successful.", "role": "admin"})
        user = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Incorrect email or password."}), 401
    session["user_id"] = user["id"]
    session["user_name"] = user["name"]
    return jsonify({"message": "Logged in successfully.", "name": user["name"], "role": "user"})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully."})


@app.get("/api/session")
def current_session():
    return jsonify({
        "logged_in": "user_id" in session,
        "admin_logged_in": "admin_id" in session,
        "name": session.get("user_name"),
    })


@app.get("/api/admin/session")
@admin_required
def admin_session():
    return jsonify({"logged_in": True, "role": "admin"})


@app.get("/api/products")
def products():
    category = request.args.get("category", "").strip()
    with get_db() as connection:
        if category and category in CATEGORIES:
            rows = connection.execute("SELECT * FROM products WHERE category = ? ORDER BY id DESC", (category,)).fetchall()
        else:
            rows = connection.execute("SELECT * FROM products ORDER BY id DESC").fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/orders")
@login_required
def create_order():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    address = str(data.get("address", "")).strip()
    items = data.get("items", [])
    if not name or not phone or not address or not isinstance(items, list) or not items:
        return jsonify({"error": "Customer details and at least one cart item are required."}), 400

    clean_items = []
    total = 0
    for item in items:
        try:
            price = float(item["price"])
            quantity = int(item["quantity"])
            product_name = str(item["name"]).strip()
            if not product_name or price < 0 or quantity < 1:
                raise ValueError
        except (KeyError, TypeError, ValueError):
            return jsonify({"error": "Cart contains an invalid item."}), 400
        clean_items.append({"name": product_name, "price": price, "quantity": quantity})
        total += price * quantity

    import json
    with get_db() as connection:
        cursor = connection.execute(
            "INSERT INTO orders (user_id, name, phone, address, items_json, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (session["user_id"], name, phone, address, json.dumps(clean_items), total, datetime.utcnow().isoformat()),
        )
    return jsonify({"message": "Order placed successfully.", "order_id": cursor.lastrowid, "total": round(total, 2)})


@app.post("/api/contact")
def contact():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip()
    message = str(data.get("message", "")).strip()
    if not name or not email or not message:
        return jsonify({"error": "All contact fields are required."}), 400
    with get_db() as connection:
        connection.execute(
            "INSERT INTO contact_requests (name, email, message, created_at) VALUES (?, ?, ?, ?)",
            (name, email, message, datetime.utcnow().isoformat()),
        )
    return jsonify({"message": "Thank you. Your message has been received."})


@app.post("/api/admin/login")
def admin_login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    with get_db() as connection:
        admin = connection.execute("SELECT * FROM admin_users WHERE email = ?", (email,)).fetchone()
    if admin is None or not check_password_hash(admin["password_hash"], password):
        return jsonify({"error": "Invalid admin email or password."}), 401
    session["admin_id"] = admin["id"]
    return jsonify({"message": "Admin login successful."})


@app.post("/api/admin/logout")
def admin_logout():
    session.pop("admin_id", None)
    return jsonify({"message": "Admin logged out."})


@app.get("/api/admin/data")
@admin_required
def admin_data():
    with get_db() as connection:
        product_rows = connection.execute("SELECT * FROM products ORDER BY id DESC").fetchall()
        order_rows = connection.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()
        contact_rows = connection.execute("SELECT * FROM contact_requests ORDER BY id DESC").fetchall()
        user_rows = connection.execute("SELECT id, name, email, created_at FROM users ORDER BY id DESC").fetchall()
    return jsonify({
        "products": [dict(row) for row in product_rows],
        "orders": [dict(row) for row in order_rows],
        "contacts": [dict(row) for row in contact_rows],
        "users": [dict(row) for row in user_rows],
    })


@app.post("/api/admin/products")
@admin_required
def admin_add_product():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    category = str(data.get("category", "")).strip()
    image = str(data.get("image", "images/moisturizer.jpg")).strip()
    try:
        price = float(data.get("price"))
    except (TypeError, ValueError):
        price = -1
    if not name or category not in CATEGORIES or price < 0 or not image:
        return jsonify({"error": "Name, price, valid category, and image are required."}), 400
    with get_db() as connection:
        cursor = connection.execute(
            "INSERT INTO products (name, price, category, image, created_at) VALUES (?, ?, ?, ?, ?)",
            (name, price, category, image, datetime.utcnow().isoformat()),
        )
    return jsonify({"message": "Product added.", "id": cursor.lastrowid})


@app.delete("/api/admin/products/<int:product_id>")
@admin_required
def admin_delete_product(product_id):
    with get_db() as connection:
        cursor = connection.execute("DELETE FROM products WHERE id = ?", (product_id,))
    if cursor.rowcount == 0:
        return jsonify({"error": "Product not found."}), 404
    return jsonify({"message": "Product deleted."})


init_db()


if __name__ == "__main__":
    print(f"Admin email: {ADMIN_EMAIL}")
    print(f"Admin password: {ADMIN_PASSWORD}")
    app.run(debug=True)
