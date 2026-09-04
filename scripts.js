document.addEventListener("DOMContentLoaded", function () {
    let cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const formatPKR = amount => `Rs. ${Number(amount).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
    const api = async (path, options = {}) => {
        const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Something went wrong.");
        return data;
    };
    const saveCart = () => localStorage.setItem("cart", JSON.stringify(cart));
    const downloadSlip = order => {
        const lines = [
            "SKINCARE HEAVEN PAYMENT SLIP",
            "=============================",
            `Bill number: ${order.order_id}`,
            `Customer: ${order.name}`,
            `Phone: ${order.phone}`,
            `Address: ${order.address}`,
            `Payment: ${order.payment_method}`,
            "",
            ...order.items.map(item => `${item.name} x ${item.quantity} - ${formatPKR(item.price * item.quantity)}`),
            "",
            `TOTAL: ${formatPKR(order.total)}`
        ];
        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `skincare-bill-${order.order_id}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const productGrid = document.getElementById("product-grid");
    if (productGrid) {
        const filterButtons = document.querySelectorAll(".category-filter");
        const categorySelect = document.getElementById("product-category-select");
        const renderProducts = async category => {
            try {
                const products = await api(`/api/products${category ? `?category=${encodeURIComponent(category)}` : ""}`);
                productGrid.innerHTML = products.length ? products.map(product => `
                    <div class="product-card" data-product-id="${product.id}">
                        <img src="${product.image}" alt="${product.name}">
                        <p class="product-category">${product.category}</p>
                        <h3>${product.name}</h3>
                        <p class="price">${formatPKR(product.price)}</p>
                        <div class="product-actions"><button class="add-to-cart" data-product='${JSON.stringify(product).replace(/'/g, "&#39;")}'>Add to Cart</button><button class="buy-now-product" data-product='${JSON.stringify(product).replace(/'/g, "&#39;")}'>Buy Now</button></div>
                    </div>`).join("") : "<p class='empty-catalog'>No products in this category yet.</p>";
                productGrid.querySelectorAll(".add-to-cart").forEach(button => button.addEventListener("click", () => {
                    const product = JSON.parse(button.dataset.product.replace(/&#39;/g, "'"));
                    const existing = cart.find(item => item.name === product.name);
                    if (existing) existing.quantity += 1;
                    else cart.push({ name: product.name, price: Number(product.price), image: product.image, quantity: 1 });
                    saveCart();
                    alert(`${product.name} has been added to your cart!`);
                }));
                productGrid.querySelectorAll(".buy-now-product").forEach(button => button.addEventListener("click", () => {
                    const product = JSON.parse(button.dataset.product.replace(/&#39;/g, "'"));
                    const existing = cart.find(item => item.name === product.name);
                    if (existing) existing.quantity += 1;
                    else cart.push({ name: product.name, price: Number(product.price), image: product.image, quantity: 1 });
                    saveCart();
                    window.location.href = "billing.html";
                }));
            } catch (error) { productGrid.innerHTML = `<p class="empty-catalog">${error.message}</p>`; }
        };
        const setCategory = category => {
            filterButtons.forEach(button => button.classList.toggle("active", button.dataset.category === category));
            categorySelect.value = category;
            renderProducts(category);
        };
        filterButtons.forEach(button => button.addEventListener("click", () => setCategory(button.dataset.category)));
        categorySelect.addEventListener("change", () => setCategory(categorySelect.value));
        setCategory(new URLSearchParams(window.location.search).get("category") || "");
    }

    document.querySelectorAll(".category-link").forEach(card => card.addEventListener("click", () => {
        window.location.href = `products.html?category=${encodeURIComponent(card.dataset.category)}`;
    }));

    // Add to cart functionality for product page
    const addToCartButtons = document.querySelectorAll(".add-to-cart");
    addToCartButtons.forEach(button => {
        button.addEventListener("click", function() {
            const productCard = this.closest(".product-card");
            const product = {
                name: productCard.querySelector("h3").textContent,
                price: parseFloat(productCard.querySelector(".price").textContent.replace("$", "")),
                image: productCard.querySelector("img").src
            };
            
            // Add to cart
            const existingProduct = cart.find(item => item.name === product.name);
            if (existingProduct) {
                existingProduct.quantity += 1;
            } else {
                cart.push({ ...product, quantity: 1 });
            }
            
            saveCart();
            alert(`${product.name} has been added to your cart!`);
        });
    });

    const cartList = document.getElementById("cart-list");
    if (cartList) {
        const totalPrice = document.getElementById("total-price");
        const renderSimpleCart = () => {
            cartList.innerHTML = "";
            let total = 0;
            cart.forEach((item, index) => {
                total += item.price * item.quantity;
                const row = document.createElement("li");
                const details = document.createElement("div");
                details.className = "cart-item-details";
                const image = document.createElement("img");
                image.src = item.image;
                image.alt = item.name;
                const name = document.createElement("strong");
                name.textContent = `${item.name} x ${item.quantity}`;
                details.append(image, name);
                row.appendChild(details);
                const price = document.createElement("span");
                price.textContent = formatPKR(item.price * item.quantity);
                row.appendChild(price);
                const remove = document.createElement("button");
                remove.textContent = "Remove";
                remove.onclick = () => { cart.splice(index, 1); saveCart(); renderSimpleCart(); };
                row.appendChild(remove);
                cartList.appendChild(row);
            });
            totalPrice.textContent = `Total: ${formatPKR(total)}`;
        };
        renderSimpleCart();
        document.getElementById("checkout-button").addEventListener("click", () => {
            window.location.href = cart.length ? "billing.html" : "products.html";
        });
    }

    // Cart functionality for billing page
    if (document.getElementById("cart-table")) {
        const cartTable = document.getElementById("cart-table").querySelector("tbody");
        const totalAmount = document.getElementById("total-amount");

        function updateCart() {
            // Clear current cart display
            cartTable.innerHTML = "";
            
            // Calculate total
            let total = 0;

            // Display cart items
            cart.forEach((item, index) => {
                const row = document.createElement("tr");
                
                // Product name
                const nameCell = document.createElement("td");
                nameCell.textContent = item.name;
                
                // Price
                const priceCell = document.createElement("td");
                priceCell.textContent = formatPKR(item.price);
                
                // Quantity
                const quantityCell = document.createElement("td");
                const quantityInput = document.createElement("input");
                quantityInput.type = "number";
                quantityInput.value = item.quantity;
                quantityInput.min = "1";
                quantityInput.addEventListener("change", function() {
                    updateQuantity(index, this.value);
                });
                quantityCell.appendChild(quantityInput);
                
                // Remove button
                const removeCell = document.createElement("td");
                const removeButton = document.createElement("button");
                removeButton.textContent = "Remove";
                removeButton.className = "remove-item";
                removeButton.onclick = () => removeItem(index);
                removeCell.appendChild(removeButton);
                
                // Add cells to row
                row.appendChild(nameCell);
                row.appendChild(priceCell);
                row.appendChild(quantityCell);
                row.appendChild(removeCell);
                
                // Add row to table
                cartTable.appendChild(row);
                
                // Update total
                total += item.price * item.quantity;
            });

            // Update total display
            totalAmount.textContent = Number(total).toLocaleString("en-PK", { maximumFractionDigits: 0 });
            
            saveCart();
        }

        function updateQuantity(index, newQuantity) {
            cart[index].quantity = Math.max(1, parseInt(newQuantity, 10) || 1);
            updateCart();
        }

        function removeItem(index) {
            cart.splice(index, 1);
            updateCart();
        }

        // Initialize cart display
        updateCart();

        // Form validation
        function validateField(field) {
            const errorMessage = document.createElement("div");
            errorMessage.className = "error-message";
            errorMessage.textContent = `Please enter your ${field.name}`;
            
            // Remove any existing error message
            const existingError = field.parentElement.querySelector(".error-message");
            if (existingError) {
                existingError.remove();
            }
            
            if (!field.value.trim()) {
                field.classList.add("error");
                field.parentElement.appendChild(errorMessage);
                errorMessage.classList.add("show");
                return false;
            } else {
                field.classList.remove("error");
                return true;
            }
        }

        // Handle Buy Now button
        const buyNowButton = document.getElementById("buy-now");
        if (buyNowButton) {
            buyNowButton.addEventListener("click", function() {
                const name = document.getElementById("username");
                const phone = document.getElementById("phone");
                const address = document.getElementById("address");
                const paymentMethod = document.getElementById("payment-method");
                
                // Validate all fields
                const isNameValid = validateField(name);
                const isPhoneValid = validateField(phone);
                const isAddressValid = validateField(address);
                const isPaymentValid = validateField(paymentMethod);

                if (!isNameValid || !isPhoneValid || !isAddressValid || !isPaymentValid) {
                    return;
                }

                if (cart.length === 0) {
                    alert("Your cart is empty!");
                    return;
                }

                api("/api/orders", { method: "POST", body: JSON.stringify({ name: name.value, phone: phone.value, address: address.value, payment_method: paymentMethod.value, items: cart })})
                    .then(order => {
                        downloadSlip({ ...order, name: name.value, phone: phone.value, address: address.value, payment_method: paymentMethod.value, items: cart });
                        alert(`Order placed successfully!\nBill #${order.order_id}\nYour payment slip was downloaded.`);
                        cart = [];
                        localStorage.removeItem("cart");
                        updateCart();
                        [name, phone, address, paymentMethod].forEach(field => { field.value = ""; field.classList.remove("error"); });
                    })
                    .catch(error => {
                        if (error.message.toLowerCase().includes("log in")) window.location.href = "auth.html";
                        else alert(error.message);
                    });
            });
        }
    }

    const contactForm = document.getElementById("contact-form");
    if (contactForm) contactForm.addEventListener("submit", event => {
        event.preventDefault();
        const formData = new FormData(contactForm);
        api("/api/contact", { method: "POST", body: JSON.stringify(Object.fromEntries(formData)) })
            .then(data => { alert(data.message); contactForm.reset(); }).catch(error => alert(error.message));
    });

    const authMessage = document.getElementById("auth-message");
    const authHeading = document.getElementById("auth-heading");
    document.querySelectorAll("[data-auth-tab]").forEach(tab => tab.addEventListener("click", () => {
        const signup = tab.dataset.authTab === "signup";
        document.querySelectorAll("[data-auth-tab]").forEach(item => item.classList.toggle("active", item === tab));
        document.getElementById("login-form").classList.toggle("is-hidden", signup);
        document.getElementById("signup-form").classList.toggle("is-hidden", !signup);
        if (authHeading) authHeading.textContent = signup ? "Create your account" : "Welcome back";
        if (authMessage) authMessage.textContent = "";
    }));
    const submitAuth = (endpoint, payload) => api(endpoint, { method: "POST", body: JSON.stringify(payload) })
        .then(data => {
            authMessage.textContent = data.message;
            window.location.href = data.role === "admin" ? "admin.html" : "index.html";
        })
        .catch(error => { authMessage.textContent = error.message; });
    const loginForm = document.getElementById("login-form");
    if (loginForm) loginForm.addEventListener("submit", event => {
        event.preventDefault();
        submitAuth("/api/login", { email: document.getElementById("login-email").value, password: document.getElementById("login-password").value });
    });
    const signupForm = document.getElementById("signup-form");
    if (signupForm) signupForm.addEventListener("submit", event => {
        event.preventDefault();
        submitAuth("/api/signup", { name: document.getElementById("signup-name").value, email: document.getElementById("signup-email").value, password: document.getElementById("signup-password").value });
    });

    document.querySelectorAll(".password-toggle").forEach(toggle => toggle.addEventListener("click", () => {
        const input = document.getElementById(toggle.dataset.passwordTarget);
        const visible = input.type === "text";
        input.type = visible ? "password" : "text";
        toggle.textContent = visible ? "◉" : "○";
        toggle.setAttribute("aria-label", visible ? "Show password" : "Hide password");
    }));

    document.querySelectorAll(".logout-button").forEach(button => button.addEventListener("click", async () => {
        try { await api("/api/logout", { method: "POST" }); } finally { window.location.href = "auth.html"; }
    }));

    const adminLoginForm = document.getElementById("admin-login-form");
    const adminLoginPanel = document.getElementById("admin-login-panel");
    const adminDashboard = document.getElementById("admin-dashboard");
    const adminView = adminDashboard ? adminDashboard.dataset.adminView : "";
    document.querySelectorAll(".admin-brand").forEach(brand => {
        brand.innerHTML = "<span>SH</span> SKINCARE HEAVEN";
    });
    const adminNav = document.querySelector(".admin-nav");
    if (adminNav) {
        const firstAdminLink = adminNav.querySelector("a");
        if (firstAdminLink) firstAdminLink.remove();
        const productsLink = adminNav.querySelector("a");
        if (productsLink) productsLink.textContent = "Manage Products";
    }
    const adminMessage = document.getElementById("admin-login-message");
    const adminRequest = (path, options = {}) => api(path, options);
    const renderAdminList = (elementId, rows, renderer, emptyText) => {
        const element = document.getElementById(elementId);
        element.innerHTML = rows.length ? rows.map(renderer).join("") : `<p class="admin-empty">${emptyText}</p>`;
    };
    const loadAdminDashboard = async () => {
        await adminRequest("/api/admin/session");
        const data = await adminRequest("/api/admin/data");
        const productCount = document.getElementById("product-count");
        if (productCount) productCount.textContent = `${data.products.length} items`;
        const statValues = {
            "admin-product-stat": data.products.length,
            "admin-order-stat": data.orders.length,
            "admin-feedback-stat": data.contacts.length,
            "admin-user-stat": data.users.length,
        };
        Object.entries(statValues).forEach(([id, value]) => {
            const stat = document.getElementById(id);
            if (stat) stat.textContent = value;
        });
        if (document.getElementById("admin-products-list")) renderAdminList("admin-products-list", data.products, product => `<div class="admin-row"><div><strong>${product.name}</strong><small>${product.category} - ${formatPKR(product.price)}</small></div><button class="delete-product" data-id="${product.id}">Delete</button></div>`, "No products yet.");
        if (document.getElementById("admin-orders-list")) renderAdminList("admin-orders-list", data.orders, order => `<div class="admin-row stacked"><strong>Order #${order.id} · ${order.name}</strong><small>${formatPKR(order.total)} · ${order.created_at.slice(0, 10)}</small><p>${order.address} · ${order.phone}</p></div>`, "No orders yet.");
        if (document.getElementById("admin-contacts-list")) renderAdminList("admin-contacts-list", data.contacts, contact => `<div class="admin-row stacked"><strong>${contact.name}</strong><small>${contact.email}</small><p>${contact.message}</p></div>`, "No messages yet.");
        if (document.getElementById("admin-users-list")) renderAdminList("admin-users-list", data.users, user => `<div class="admin-row"><div><strong>${user.name}</strong><small>${user.email}</small></div><small>${user.created_at.slice(0, 10)}</small></div>`, "No users yet.");
        document.querySelectorAll(".delete-product").forEach(button => button.addEventListener("click", async () => {
            await adminRequest(`/api/admin/products/${button.dataset.id}`, { method: "DELETE" });
            loadAdminDashboard();
        }));
    };
    if (adminDashboard) {
        loadAdminDashboard().then(() => {
            adminDashboard.classList.remove("is-hidden");
        }).catch(() => {
            if (!adminLoginForm) window.location.href = "auth.html";
        });
    }
    if (adminLoginForm) adminLoginForm.addEventListener("submit", async event => {
        event.preventDefault();
        try {
            await adminRequest("/api/admin/login", { method: "POST", body: JSON.stringify({ email: document.getElementById("admin-email").value, password: document.getElementById("admin-password").value }) });
            window.location.href = "admin.html";
        } catch (error) { adminMessage.textContent = error.message; }
    });
    const addProductForm = document.getElementById("add-product-form");
    if (addProductForm) addProductForm.addEventListener("submit", async event => {
        event.preventDefault();
        await adminRequest("/api/admin/products", { method: "POST", body: JSON.stringify({ name: document.getElementById("product-name").value, price: document.getElementById("product-price").value, category: document.getElementById("product-category").value, image: document.getElementById("product-image").value }) });
        addProductForm.reset(); loadAdminDashboard();
    });
    const adminLogout = document.getElementById("admin-logout");
    if (adminLogout) adminLogout.addEventListener("click", async () => { await api("/api/logout", { method: "POST" }); window.location.href = "auth.html"; });
});
