const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  try {
    if (req.headers.authorization?.startsWith("Bearer")) {
      const token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = decoded;
      return next();
    }

    return res.status(401).json({ message: "No token provided" });
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = protect;