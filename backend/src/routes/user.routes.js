import { Router } from "express";
import { addToHistory, getUserHistory, login, register, deleteUserHistory, googleAuth } from "../controllers/user.controller.js";

const router = Router();

router.route("/google-auth").post(googleAuth);

router.route("/login").post(login);

router.route("/register").post(register)

router.route("/add_to_activity").post(addToHistory)

router.route("/get_all_activity").get(getUserHistory)

router.route("/delete_activity").delete(deleteUserHistory)

export default router;