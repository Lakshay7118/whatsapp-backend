const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      phone: user.phone,
      email: user.email,
      role: user.role, // ✅ ADD THIS (MOST IMPORTANT)
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

module.exports = generateToken;