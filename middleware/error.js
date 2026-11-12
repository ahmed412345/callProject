const errorMiddleware = (err, req, res, next) => {
    console.error(err.message);
    if (res.headersSent) {
        return next(err);
    }
    res.status(err.statusCode || 500).json({
        status: "Error",
        message: err.message,
    });
};
export default errorMiddleware;
