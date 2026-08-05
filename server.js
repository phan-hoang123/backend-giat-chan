const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const bcrypt = require("bcryptjs");

// Cấu hình kết nối Database
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

db.getConnection((err, connection) => {
    if (err) console.error("❌ Lỗi kết nối DB:", err.message);
    else {
        console.log("✅ Đã kết nối thành công vào Két Sắt MySQL!");
        connection.release();
    }
});

// ==========================================
// THÊM TÍNH NĂNG ĐĂNG KÝ / ĐĂNG NHẬP
// ==========================================

// 1. Đăng ký tài khoản
app.post("/api/register", async (req, res) => {
  const { phone, name, password } = req.body;

  // Kiểm tra xem SĐT đã tồn tại chưa
  db.query(
    "SELECT * FROM users WHERE phone = ?",
    [phone],
    async (err, results) => {
      if (err) return res.status(500).json({ error: "Lỗi máy chủ" });
      if (results.length > 0) {
        return res
          .status(400)
          .json({ error: "Số điện thoại này đã được đăng ký!" });
      }

      // Mã hóa mật khẩu (biến 123456 thành chuỗi ký tự loằng ngoằng)
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Lưu vào Két sắt
      db.query(
        "INSERT INTO users (phone, name, password) VALUES (?, ?, ?)",
        [phone, name, hashedPassword],
        (err, result) => {
          if (err) return res.status(500).json({ error: "Lỗi lưu dữ liệu" });
          res.json({
            message: "Đăng ký thành công!",
            name: name,
            phone: phone,
          });
        },
      );
    },
  );
});

// 2. Đăng nhập
app.post("/api/login", (req, res) => {
  const { phone, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE phone = ?",
    [phone],
    async (err, results) => {
      if (err) return res.status(500).json({ error: "Lỗi máy chủ" });
      if (results.length === 0) {
        return res
          .status(400)
          .json({ error: "Sai Số điện thoại hoặc Mật khẩu!" });
      }

      const user = results[0];
      // So sánh mật khẩu khách nhập với mật khẩu đã mã hóa trong két sắt
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res
          .status(400)
          .json({ error: "Sai Số điện thoại hoặc Mật khẩu!" });
      }

      res.json({
            message: "Đăng nhập thành công",
            id: user.id,
            name: user.name,
            phone: user.phone,
            role: user.role 
        });
    },
  );
});

// ==========================================
// TÍNH NĂNG: SỔ ĐỊA CHỈ
// ==========================================

// 1. Lấy danh sách địa chỉ đã lưu của 1 số điện thoại
app.get("/api/addresses", (req, res) => {
  const { phone } = req.query;
  db.query(
    "SELECT id, address_text as text FROM saved_addresses WHERE phone = ?",
    [phone],
    (err, results) => {
      if (err) return res.status(500).json({ error: "Lỗi máy chủ" });
      res.json(results);
    },
  );
});

// 2. Nhận địa chỉ mới từ App và lưu vào DB
app.post("/api/addresses", (req, res) => {
  const { phone, text } = req.body;
  db.query(
    "INSERT INTO saved_addresses (phone, address_text) VALUES (?, ?)",
    [phone, text],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Lỗi lưu dữ liệu" });
      res.json({ id: result.insertId.toString(), text: text });
    },
  );
});

// Lấy danh sách Đơn Hàng
app.get("/api/orders", (req, res) => {
  const sql = "SELECT * FROM orders ORDER BY created_at DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "Lỗi lấy dữ liệu" });
    res.json(results);
  });
});

// Tạo Đơn Hàng (SỬA LỖI Ở ĐÂY: Trạng thái mặc định là NEED_PICKUP)
app.post("/api/orders", (req, res) => {
  const {
    order_code,
    customer_name,
    customer_phone,
    address,
    items,
    total_amount,
  } = req.body;

  // Đổi 'PROCESSING' thành 'NEED_PICKUP' để hiển thị ở Tuyến Đi Lấy
  const sql = `INSERT INTO orders (order_code, customer_name, customer_phone, address, items, total_amount, status) 
                 VALUES (?, ?, ?, ?, ?, ?, 'NEED_PICKUP')`;

  db.query(
    sql,
    [order_code, customer_name, customer_phone, address, items, total_amount],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Lỗi lưu đơn hàng" });
      res.json({ message: "Lưu đơn hàng thành công!", id: result.insertId });
    },
  );
});

// Cập nhật trạng thái
app.put("/api/orders/:id/status", (req, res) => {
  const orderId = req.params.id;
  const { newStatus } = req.body;
  const sql = "UPDATE orders SET status = ? WHERE id = ?";
  db.query(sql, [newStatus, orderId], (err, result) => {
    if (err) return res.status(500).json({ error: "Lỗi cập nhật trạng thái" });
    res.json({ message: "Đã cập nhật trạng thái!" });
  });
});

// Sổ Quỹ
app.get("/api/transactions", (req, res) => {
  const sql = "SELECT * FROM transactions ORDER BY created_at DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "Lỗi lấy sổ quỹ" });
    res.json(results);
  });
});

app.post("/api/transactions", (req, res) => {
  const { trans_code, type, amount, description } = req.body;
  const sql = `INSERT INTO transactions (trans_code, type, amount, description) VALUES (?, ?, ?, ?)`;
  db.query(sql, [trans_code, type, amount, description], (err, result) => {
    if (err) return res.status(500).json({ error: "Lỗi ghi sổ quỹ" });
    res.json({ message: "Ghi sổ quỹ thành công!" });
  });
});

// ==========================================
// TÍNH NĂNG: KIỂM KHO (INVENTORY)
// ==========================================

// 1. API Lấy danh sách vật tư
app.get("/api/inventory", (req, res) => {
  const sql = "SELECT * FROM inventory";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "Lỗi lấy dữ liệu kho" });
    res.json(results);
  });
});

// 2. API Nhập kho (Cộng thêm số lượng vào vật tư đã có)
app.put("/api/inventory/:id/restock", (req, res) => {
  const itemId = req.params.id;
  const { added_amount } = req.body; // Số lượng nhập thêm
  
  const sql = "UPDATE inventory SET stock = stock + ? WHERE id = ?";
  db.query(sql, [added_amount, itemId], (err, result) => {
    if (err) return res.status(500).json({ error: "Lỗi cập nhật kho" });
    res.json({ message: "Đã nhập kho thành công!" });
  });
});

// 3. API Khai báo đồ mới (Tự động thêm khi quét mã lạ)
app.post("/api/inventory", (req, res) => {
  // Lấy thông tin app gửi lên
  const { name, min_stock, unit, barcode } = req.body;
  
  // Mặc định đồ mới quét vào thì số lượng (stock) khởi điểm là 1, màu ngẫu nhiên cho đẹp
  const initialStock = 1; 
  const randomColor = "#" + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');

  const sql = "INSERT INTO inventory (name, stock, min_stock, unit, color, barcode) VALUES (?, ?, ?, ?, ?, ?)";
  db.query(sql, [name, initialStock, min_stock, unit, randomColor, barcode], (err, result) => {
    if (err) return res.status(500).json({ error: "Lỗi thêm đồ mới" });
    res.json({ message: "Đã thêm thành công!", id: result.insertId });
  });
});

// 4. API Xuất kho (Trừ đi khi sử dụng)
app.put("/api/inventory/:id/consume", (req, res) => {
  const itemId = req.params.id;
  
  // Trừ mặc định 1 đơn vị, không bao giờ để số lượng bị âm (< 0)
  const sql = "UPDATE inventory SET stock = GREATEST(stock - 1, 0) WHERE id = ?";
  
  db.query(sql, [itemId], (err, result) => {
    if (err) return res.status(500).json({ error: "Lỗi trừ kho" });
    res.json({ message: "Đã trừ kho thành công!" });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server Backend đang mở cửa tại Cổng ${PORT}`);
});
