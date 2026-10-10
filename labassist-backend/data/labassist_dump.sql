-- MySQL dump 10.13  Distrib 8.4.11, for Linux (x86_64)
--
-- Host: localhost    Database: labassist
-- ------------------------------------------------------
-- Server version	8.4.11

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_logs`
--

DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `user_name` longtext,
  `role` longtext,
  `method` longtext,
  `path` longtext,
  `status_code` bigint DEFAULT NULL,
  `ip` longtext,
  `duration_ms` bigint DEFAULT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=79 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_logs`
--

LOCK TABLES `activity_logs` WRITE;
/*!40000 ALTER TABLE `activity_logs` DISABLE KEYS */;
INSERT INTO `activity_logs` VALUES (1,NULL,'','','GET','/api/v1/student/notifications',401,'::1',0,'2026-10-10 14:13:33.997'),(2,NULL,'','','GET','/api/v1/auth/me',401,'::1',0,'2026-10-10 14:13:33.997'),(3,NULL,'','','GET','/api/v1/auth/me',401,'::1',0,'2026-10-10 14:13:34.055'),(4,NULL,'','','POST','/api/v1/auth/dev-login',404,'::1',0,'2026-10-10 14:13:46.929'),(5,NULL,'','','POST','/api/v1/auth/dev-login',404,'::1',0,'2026-10-10 14:13:47.774'),(6,NULL,'','','POST','/api/v1/auth/dev-login',404,'::1',0,'2026-10-10 14:13:48.394'),(7,NULL,'','','POST','/api/v1/auth/dev-login',404,'::1',0,'2026-10-10 14:14:09.955'),(8,NULL,'','','GET','/api/v1/courses',200,'::1',266,'2026-10-10 14:15:43.108'),(9,NULL,'','','POST','/api/v1/auth/login',200,'::1',162,'2026-10-10 14:15:43.286'),(10,NULL,'','','POST','/api/v1/auth/login',401,'::1',2,'2026-10-10 14:15:43.306'),(11,NULL,'','','POST','/api/v1/auth/login',200,'::1',111,'2026-10-10 14:15:43.452'),(12,NULL,'','','POST','/api/v1/auth/login',200,'::1',96,'2026-10-10 14:15:43.567'),(13,NULL,'','','POST','/api/v1/auth/login',401,'::1',0,'2026-10-10 14:15:43.583'),(14,NULL,'','','GET','/api/v1/courses',200,'::1',179,'2026-10-10 14:16:33.074'),(15,NULL,'','','POST','/api/v1/auth/login',200,'::1',76,'2026-10-10 14:16:33.164'),(16,NULL,'','','POST','/api/v1/auth/dev-login',200,'::1',2,'2026-10-10 14:16:33.179'),(17,NULL,'','','POST','/api/v1/auth/login',200,'::1',72,'2026-10-10 14:16:33.264'),(18,NULL,'','','POST','/api/v1/auth/dev-login',200,'::1',0,'2026-10-10 14:16:33.274'),(19,NULL,'','','POST','/api/v1/auth/login',200,'::1',67,'2026-10-10 14:16:33.351'),(20,NULL,'','','POST','/api/v1/auth/dev-login',200,'::1',0,'2026-10-10 14:16:33.360'),(21,NULL,'','','POST','/api/v1/auth/login',200,'::1',67,'2026-10-10 14:16:33.437'),(22,NULL,'','','POST','/api/v1/auth/dev-login',200,'::1',0,'2026-10-10 14:16:33.448'),(23,NULL,'','','POST','/api/v1/auth/login',200,'::1',70,'2026-10-10 14:16:33.527'),(24,NULL,'','','POST','/api/v1/auth/dev-login',200,'::1',0,'2026-10-10 14:16:33.539'),(25,NULL,'','','POST','/api/v1/auth/login',200,'::1',67,'2026-10-10 14:16:33.616'),(26,NULL,'','','POST','/api/v1/auth/dev-login',404,'::1',0,'2026-10-10 14:16:33.627'),(27,NULL,'','','POST','/api/v1/auth/login',401,'::1',71,'2026-10-10 14:16:33.708'),(28,NULL,'','','GET','/',404,'::1',0,'2026-10-10 14:19:35.177'),(29,NULL,'','','GET','/favicon.ico',404,'::1',0,'2026-10-10 14:19:35.437'),(30,NULL,'','','POST','/api/v1/auth/dev-login',200,'::1',0,'2026-10-10 14:19:44.703'),(31,20,'ปริญญา สุภาวดี','staff','GET','/api/v1/auth/me',200,'::1',1,'2026-10-10 14:19:44.759'),(32,20,'ปริญญา สุภาวดี','staff','GET','/api/v1/staff/documents',200,'::1',1,'2026-10-10 14:19:45.079'),(33,20,'ปริญญา สุภาวดี','staff','GET','/api/v1/staff/reviews',200,'::1',11,'2026-10-10 14:19:45.089'),(34,20,'ปริญญา สุภาวดี','staff','POST','/api/v1/auth/logout',200,'::1',0,'2026-10-10 14:19:47.101'),(35,NULL,'','','POST','/api/v1/auth/dev-login',200,'::1',0,'2026-10-10 14:19:48.367'),(36,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/auth/me',200,'::1',1,'2026-10-10 14:19:48.529'),(37,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',4,'2026-10-10 14:19:48.589'),(38,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',4,'2026-10-10 14:19:48.815'),(39,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/stats',200,'::1',9,'2026-10-10 14:19:48.814'),(40,NULL,'','','GET','/api/v1/courses',200,'::1',173,'2026-10-10 14:19:48.981'),(41,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',1,'2026-10-10 14:22:10.520'),(42,NULL,'','','GET','/api/v1/courses',200,'::1',166,'2026-10-10 14:22:10.695'),(43,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',1,'2026-10-10 14:22:12.475'),(44,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/profile',200,'::1',1,'2026-10-10 14:22:18.390'),(45,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',3,'2026-10-10 14:23:03.202'),(46,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',2,'2026-10-10 14:23:03.210'),(47,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',2,'2026-10-10 14:23:52.928'),(48,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',9,'2026-10-10 14:26:31.299'),(49,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',9,'2026-10-10 14:26:31.304'),(50,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',2,'2026-10-10 14:26:33.770'),(51,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/auth/me',200,'::1',1,'2026-10-10 14:26:33.775'),(52,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/auth/me',200,'::1',1,'2026-10-10 14:26:33.833'),(53,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',1,'2026-10-10 14:26:34.062'),(54,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',1,'2026-10-10 14:26:36.046'),(55,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',1,'2026-10-10 14:27:09.600'),(56,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',3,'2026-10-10 14:27:09.609'),(57,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',2,'2026-10-10 14:33:12.889'),(58,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',2,'2026-10-10 14:33:12.899'),(59,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',1,'2026-10-10 14:33:14.669'),(60,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/auth/me',200,'::1',1,'2026-10-10 14:33:14.680'),(61,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/auth/me',200,'::1',1,'2026-10-10 14:33:14.733'),(62,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',1,'2026-10-10 14:33:14.905'),(63,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',1,'2026-10-10 14:33:17.649'),(64,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users/18/courses',200,'::1',8,'2026-10-10 14:33:38.923'),(65,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',1,'2026-10-10 14:33:44.800'),(66,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/profile',200,'::1',1,'2026-10-10 14:33:55.390'),(67,NULL,'','','GET','/api/v1/courses',200,'::1',168,'2026-10-10 14:33:56.813'),(68,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',1,'2026-10-10 14:33:57.517'),(69,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',1,'2026-10-10 14:33:59.437'),(70,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',2,'2026-10-10 14:34:30.991'),(71,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',1,'2026-10-10 14:34:31.004'),(72,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',3,'2026-10-10 14:34:33.053'),(73,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/auth/me',200,'::1',3,'2026-10-10 14:34:33.055'),(74,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/auth/me',200,'::1',1,'2026-10-10 14:34:33.123'),(75,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',2,'2026-10-10 14:34:33.361'),(76,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',1,'2026-10-10 14:34:34.468'),(77,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/instructor/notifications',200,'::1',1,'2026-10-10 14:35:03.142'),(78,19,'ผู้ดูแลระบบ','admin','GET','/api/v1/admin/users',200,'::1',2,'2026-10-10 14:35:07.854');
/*!40000 ALTER TABLE `activity_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `application_history`
--

DROP TABLE IF EXISTS `application_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `application_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `application_id` bigint unsigned NOT NULL,
  `student_id` bigint unsigned NOT NULL,
  `posting_id` bigint unsigned NOT NULL DEFAULT '0',
  `course_id` bigint unsigned NOT NULL,
  `role_applied` longtext,
  `status` longtext,
  `grade` varchar(5) DEFAULT NULL,
  `applied_at` datetime(3) DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `reviewed_by_id` bigint unsigned DEFAULT NULL,
  `note` text,
  `withdrawal_reason` text,
  `ocr_warning` text,
  `grade_proof_file_name` longtext,
  `grade_proof_data` longblob,
  `archived_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_application_history_application_id` (`application_id`),
  KEY `idx_application_history_posting_id` (`posting_id`),
  KEY `fk_application_history_student_id` (`student_id`),
  KEY `fk_application_history_reviewed_by_id` (`reviewed_by_id`),
  KEY `fk_application_history_course_id` (`course_id`),
  CONSTRAINT `fk_application_history_course_id` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_application_history_posting_id` FOREIGN KEY (`posting_id`) REFERENCES `postings` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_application_history_reviewed_by_id` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_application_history_student_id` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `application_history`
--

LOCK TABLES `application_history` WRITE;
/*!40000 ALTER TABLE `application_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `application_history` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`labassist`@`%`*/ /*!50003 TRIGGER `trg_application_history_posting_course_bi` BEFORE INSERT ON `application_history` FOR EACH ROW BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'application_history.course_id must match postings.course_id';
    END IF;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`labassist`@`%`*/ /*!50003 TRIGGER `trg_application_history_posting_course_bu` BEFORE UPDATE ON `application_history` FOR EACH ROW BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'application_history.course_id must match postings.course_id';
    END IF;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `applications`
--

DROP TABLE IF EXISTS `applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `applications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `student_id` bigint unsigned NOT NULL,
  `posting_id` bigint unsigned NOT NULL DEFAULT '0',
  `course_id` bigint unsigned NOT NULL,
  `role_applied` enum('labboy') NOT NULL,
  `status` enum('pending','accepted','rejected','withdrawn') DEFAULT 'pending',
  `grade` varchar(5) DEFAULT NULL,
  `applied_at` datetime(3) DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `reviewed_by_id` bigint unsigned DEFAULT NULL,
  `note` text,
  `withdrawal_reason` text,
  `cancelled` tinyint(1) NOT NULL DEFAULT '0',
  `grade_proof_file_name` longtext,
  `grade_proof_data` longblob,
  `ocr_warning` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_application_student_posting` (`student_id`,`posting_id`),
  KEY `idx_applications_student_id` (`student_id`),
  KEY `idx_applications_posting_id` (`posting_id`),
  KEY `idx_applications_course_id` (`course_id`),
  KEY `fk_applications_reviewed_by_id` (`reviewed_by_id`),
  CONSTRAINT `fk_applications_course_id` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_applications_posting_id` FOREIGN KEY (`posting_id`) REFERENCES `postings` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_applications_reviewed_by_id` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_applications_student_id` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `applications`
--

LOCK TABLES `applications` WRITE;
/*!40000 ALTER TABLE `applications` DISABLE KEYS */;
INSERT INTO `applications` VALUES (1,22,83,83,'labboy','pending','B+','2026-10-10 14:16:32.736',NULL,NULL,NULL,NULL,0,'',NULL,NULL),(2,23,83,83,'labboy','pending','B','2026-10-10 14:16:32.792',NULL,NULL,NULL,NULL,0,'',NULL,NULL),(3,24,83,83,'labboy','pending','A','2026-10-10 14:16:32.823',NULL,NULL,NULL,NULL,0,'',NULL,NULL),(4,25,83,83,'labboy','pending','B+','2026-10-10 14:16:32.848',NULL,NULL,NULL,NULL,0,'',NULL,NULL),(5,26,83,83,'labboy','pending','A','2026-10-10 14:16:32.872',NULL,NULL,NULL,NULL,0,'',NULL,NULL);
/*!40000 ALTER TABLE `applications` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`labassist`@`%`*/ /*!50003 TRIGGER `trg_applications_posting_course_bi` BEFORE INSERT ON `applications` FOR EACH ROW BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'applications.course_id must match postings.course_id';
    END IF;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`labassist`@`%`*/ /*!50003 TRIGGER `trg_applications_posting_course_bu` BEFORE UPDATE ON `applications` FOR EACH ROW BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'applications.course_id must match postings.course_id';
    END IF;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `blacklists`
--

DROP TABLE IF EXISTS `blacklists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `blacklists` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `student_id` bigint unsigned NOT NULL,
  `application_id` bigint unsigned DEFAULT NULL,
  `course_id` bigint unsigned DEFAULT NULL,
  `reported_by_id` bigint unsigned NOT NULL,
  `reason` text NOT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  `revoked_at` datetime(3) DEFAULT NULL,
  `revoked_by_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_blacklists_student_id` (`student_id`),
  KEY `idx_blacklists_application_id` (`application_id`),
  KEY `idx_blacklists_revoked_at` (`revoked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `blacklists`
--

LOCK TABLES `blacklists` WRITE;
/*!40000 ALTER TABLE `blacklists` DISABLE KEYS */;
/*!40000 ALTER TABLE `blacklists` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `calendar_dates`
--

DROP TABLE IF EXISTS `calendar_dates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calendar_dates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `name` varchar(200) NOT NULL,
  `date_type` enum('public_holiday','university_holiday','no_class','case_exception','makeup') NOT NULL,
  `scope` enum('global','semester','case') NOT NULL DEFAULT 'global',
  `semester` varchar(10) DEFAULT NULL,
  `academic_year` bigint DEFAULT NULL,
  `staff_case_id` bigint unsigned DEFAULT NULL,
  `affects_work` tinyint(1) NOT NULL DEFAULT '1',
  `original_date_id` bigint unsigned DEFAULT NULL,
  `created_by_id` bigint unsigned NOT NULL,
  `edit_reason` varchar(500) DEFAULT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_calendar_dates_date` (`date`),
  KEY `idx_calendar_dates_staff_case_id` (`staff_case_id`),
  KEY `idx_calendar_dates_original_date_id` (`original_date_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `calendar_dates`
--

LOCK TABLES `calendar_dates` WRITE;
/*!40000 ALTER TABLE `calendar_dates` DISABLE KEYS */;
/*!40000 ALTER TABLE `calendar_dates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_schedules`
--

DROP TABLE IF EXISTS `class_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_schedules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `image_data` longblob,
  `slots` longtext,
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_class_schedules_user_id` (`user_id`),
  CONSTRAINT `fk_class_schedules_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `class_schedules`
--

LOCK TABLES `class_schedules` WRITE;
/*!40000 ALTER TABLE `class_schedules` DISABLE KEYS */;
/*!40000 ALTER TABLE `class_schedules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `classlist_courses`
--

DROP TABLE IF EXISTS `classlist_courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classlist_courses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `academic_year` smallint unsigned NOT NULL,
  `semester` tinyint unsigned NOT NULL,
  `department_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `course_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject_code` char(6) COLLATE utf8mb4_unicode_ci NOT NULL,
  `curriculum_code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title_th` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `title_en` text COLLATE utf8mb4_unicode_ci,
  `credits` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `schedule` text COLLATE utf8mb4_unicode_ci,
  `section_no` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `capacity` int unsigned DEFAULT NULL,
  `enrolled` int unsigned DEFAULT NULL,
  `remaining` int DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instructors` text COLLATE utf8mb4_unicode_ci,
  `source_file` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_row` smallint unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_classlist_course` (`academic_year`,`semester`,`course_code`,`section_no`),
  KEY `idx_classlist_department` (`department_code`),
  KEY `idx_classlist_subject` (`subject_code`)
) ENGINE=InnoDB AUTO_INCREMENT=481 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `classlist_courses`
--

LOCK TABLES `classlist_courses` WRITE;
/*!40000 ALTER TABLE `classlist_courses` DISABLE KEYS */;
INSERT INTO `classlist_courses` VALUES (1,2569,1,'517','517100-51','517100','51','ความรอบรู้ทางด้านสารสนเทศและคอมพิวเตอร์\n(ล.เสรีทุกคณะทุกชั้นปี)','COMPUTER AND INFORMATION LITERACY','3 (2-2-5)','We 16:40 - 20:15 5406 ว.4','1',180,179,1,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_517(1).xlsx',10,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(2,2569,1,'517','517101-165','517101','165','ความรอบรู้และความเป็นพลเมืองดิจิทัล\n(บ.คอมปี1)','DIGITAL LITERACY AND CITIZENSHIP','3 (2-2-5)','We 08:30 - 10:15 1227/1,1227/2 ว.1\nWe 10:20 - 12:05 1227/1,1227/2 ว.1','1',100,87,13,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_517(1).xlsx',11,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(3,2569,1,'517','517111-165','517111','165','การเขียนโปรแกรมคอมพิวเตอร์สำหรับนักวิทยาการข้อมูล\n(บ.วิทข้อมูลปี1)','COMPUTER PROGRAMMING FOR DATA SCIENTISTS','3 (2-2-5)','Mo 10:20 - 12:05 1239 ว.1\nMo 13:00 - 14:45 1227/1,1227/2 ว.1','1',80,50,30,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_517(1).xlsx',12,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(4,2569,1,'517','517121-165','517121','165','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1\n(บ.คอมปี1)','COMPUTER PROGRAMMING SKILL I','4 (2-4-6)','Mo 10:20 - 12:05 ร.วท.2\nTu 13:00 - 16:35 1227/1,1227/2 ว.1\nFr 16:40 - 18:25 1227/1,1227/2 ว.1','1',110,98,12,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี\nผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์','classlist2569_517(1).xlsx',13,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(5,2569,1,'517','517121-165','517121','165','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1\n(บ.สนเทศปี1)','COMPUTER PROGRAMMING SKILL I','4 (2-4-6)','Mo 10:20 - 12:05 ร.วท.2\nWe 13:00 - 16:35 1227/1,1227/2 ว.1\nFr 16:40 - 18:25 1334 ว.1','2',105,103,2,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี\nผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์','classlist2569_517(1).xlsx',14,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(6,2569,1,'517','517121-2560','517121','2560','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1\n(บ.คอม สนเทศปี6-8)','COMPUTER PROGRAMMING SKILL I','4 (2-4-6)','Mo 10:20 - 12:05 ร.วท.2\nTu 13:00 - 16:35 1227/1,1227/2 ว.1\nFr 16:40 - 18:25 1227/1,1227/2 ว.1','1',100,0,100,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี\nผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์','classlist2569_517(1).xlsx',15,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(7,2569,1,'517','517121-2560','517121','2560','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1\n(บ.คอม สนเทศปี6-8)','COMPUTER PROGRAMMING SKILL I','4 (2-4-6)','Mo 10:20 - 12:05 ร.วท.2\nWe 13:00 - 16:35 1227/1,1227/2 ว.1\nFr 16:40 - 18:25 1334 ว.1','2',100,0,100,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี\nผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์','classlist2569_517(1).xlsx',16,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(8,2569,1,'517','517123-2561','517123','2561','การเขียนโปรแกรมคอมพิวเตอร์สำหรับนักวิทยาการข้อมูล\n(พบผู้สอนก่อนลงทะเบียน)','COMPUTER PROGRAMMING FOR DATA SCIENTISTS','3 (2-2-5)','Mo 10:20 - 12:05 1239 ว.1\nMo 13:00 - 14:45 1227/1,1227/2 ว.1','1',0,0,0,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_517(1).xlsx',17,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(9,2569,1,'517','517211-165','517211','165','โครงสร้างข้อมูล\n(บ.คอมปี2ขึ้นไป)','DATA STRUCTURES','3 (2-2-5)','Tu 08:30 - 10:15 1227/1,1227/2 ว.1\nTu 13:00 - 15:40 1239 ว.1','1',100,91,9,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_517(1).xlsx',18,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(10,2569,1,'517','517211-2560','517211','2560','โครงสร้างข้อมูล\n(บ.คอม ปี6-8)','DATA STRUCTURES','4 (3-2-7)','Tu 08:30 - 10:15 1227/1,1227/2 ว.1\nTu 13:00 - 15:40 1239 ว.1','1',20,2,18,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_517(1).xlsx',19,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(11,2569,1,'517','517212-2560','517212','2560','การออกแบบวงจรตรรกะเชิงเลข\n(บ.คอม ปี6-8)','DIGITAL LOGIC DESIGN','4 (3-2-7)','Mo 13:00 - 15:40 410A-410B\nFr 08:30 - 10:15 410A-410B','1',40,0,40,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_517(1).xlsx',21,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(12,2569,1,'517','517214-165','517214','165','โครงสร้างข้อมูลพื้นฐานสำหรับวิทยาการข้อมูล\n(บ.วิทข้อมูลปี2-4)','FUNDAMENTALS OF DATA STRUCTURES FOR DATA SCIENCE','3 (2-2-5)','We 14:50 - 16:35 1239 ว.1\nTh 13:00 - 14:45 1334 ว.1','1',88,75,13,'W','ผู้ช่วยศาสตราจารย์ ดร.ทัศนวรรณ  ศูนย์กลาง','classlist2569_517(1).xlsx',23,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(13,2569,1,'517','517214-2561','517214','2561','โครงสร้างข้อมูลและขั้นตอนวิธี\n(บ.วิทข้อมูลปี6-8)','DATA STRUCTURE AND ALGORITHM','3 (2-2-5)','We 14:50 - 16:35 1239 ว.1\nTh 13:00 - 14:45 1334 ว.1','1',1,1,0,'W','ผู้ช่วยศาสตราจารย์ ดร.ทัศนวรรณ  ศูนย์กลาง','classlist2569_517(1).xlsx',24,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(14,2569,1,'517','517331-160','517331','160','ปัญญาประดิษฐ์\n(ล.คอมปี6-8)','ARTIFICIAL INTELLIGENCE','3 (2-2-5)','Th 13:00 - 14:45 410A-410B\nTh 14:50 - 16:35 410A-410B','1',10,4,6,'W','ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์','classlist2569_517(1).xlsx',34,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(15,2569,1,'517','517341-160','517341','160','สถาปัตยกรรมและเทคโนโลยีเครือข่ายคอมพิวเตอร์\n(ล.คอมปี6-8)','COMPUTER NETWORK ARCHITECTURE AND TECHNOLOGY','3 (2-2-5)','Th 08:30 - 10:15 1227/2 ว.1\nTh 10:20 - 12:05 1227/2 ว.1','1',9999,0,9999,'W','อาจารย์เสฐลัทธ์  รอดเหตุภัย','classlist2569_517(1).xlsx',35,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(16,2569,1,'517','517354-165','517354','165','การประมวลผลสัญญาณดิจิทัล\n(ล.คอมปี3-4 (นศ.นำคอมมาเอง))','DIGITAL SIGNAL PROCESSING','3 (2-2-5)','Tu 08:30 - 10:15 1639 ว.1\nTu 10:20 - 12:05 1639 ว.1','1',30,15,15,'W','อาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี','classlist2569_517(1).xlsx',36,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(17,2569,1,'517','517392-165','517392','165','การเตรียมความพร้อมสำหรับโครงงานวิจัย\n(บ.คอมปี3ขึ้นไป)','PREPARATION OF RESEARCH PROJECT','1 (0-2-1)','Mo 12:10 - 12:55 1639 ว.1\nTu 12:10 - 12:55 1639 ว.1','1',20,6,14,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น\nผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์อภิเษก  หงษ์วิทยากร\nผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์\nอาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต\nอาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_517(1).xlsx',39,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(18,2569,1,'517','517431-165','517431','165','การเรียนรู้ของเครื่อง\n(ล.คอมปี3)','MACHINE LEARNING','3 (2-2-5)','Mo 14:50 - 16:35 1240 ว.1\nWe 16:40 - 18:25 1227/2 ว.1','1',51,49,2,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_517(1).xlsx',41,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(19,2569,1,'517','517433-160','517433','160','การเรียนรู้เชิงลึกสำหรับคอมพิวเตอร์วิทัศน์\n(ล.คอมปี6ขึ้นไป (แนะนำให้นศ.นำคอมส่วนตัวที่มีgpuมาเรียน))','DEEP LEARNING FOR COMPUTER VISION','3 (2-2-5)','Mo 08:30 - 12:05 1639 ว.1','1',2,2,0,'W','อาจารย์ ดร.ภูริวัจน์  วรวิชัยพัฒน์','classlist2569_517(1).xlsx',42,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(20,2569,1,'517','517433-165','517433','165','การเรียนรู้เชิงลึกสำหรับคอมพิวเตอร์วิทัศน์\n(ล.คอมปี3ขึ้นไป (แนะนำให้นศ.นำคอมส่วนตัวที่มีgpuมาเรียน))','DEEP LEARNING FOR COMPUTER VISION','3 (2-2-5)','Mo 08:30 - 12:05 1639 ว.1','1',23,20,3,'W','อาจารย์ ดร.ภูริวัจน์  วรวิชัยพัฒน์','classlist2569_517(1).xlsx',43,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(21,2569,1,'517','517443-165','517443','165','การจัดการความมั่นคงปลอดภัยทางไซเบอร์\n(ล.คอมปี3 (นศ.นำคอมมาเอง))','CYBERSECURITY MANAGEMENT','3 (2-2-5)','Th 08:30 - 10:15 1227/2 ว.1\nTh 10:20 - 12:05 1227/1 ว.1','1',30,22,8,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_517(1).xlsx',44,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(22,2569,1,'517','517461-165','517461','165','ระบบปฏิบัติการหุ่นยนต์และการควบคุม\n(ล.คอมปี3-5 พบผู้สอนก่อนลงทะเบียน)','ROBOT OPERATING SYSTEM AND CONTROL','3 (2-2-5)','We 08:30 - 12:05 1639 ว.1','1',10,0,10,'W','ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','classlist2569_517(1).xlsx',45,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(23,2569,1,'517','517465-165','517465','165','วิศวกรรมคุณลักษณะ\n(ล.คอมปี3)','FEATURE ENGINEERING','3 (2-2-5)','Fr 08:30 - 10:15 1639 ว.1\nFr 10:20 - 12:05 1639 ว.1','1',30,9,21,'W','ผู้ช่วยศาสตราจารย์ ดร.รัชดาพร  คณาวงษ์','classlist2569_517(1).xlsx',46,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(24,2569,1,'517','517493-165','517493','165','โครงงานวิจัย 1\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','1',30,0,30,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_517(1).xlsx',49,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(25,2569,1,'517','517493-165','517493','165','โครงงานวิจัย 1\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','2',30,10,20,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_517(1).xlsx',50,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(26,2569,1,'517','517493-165','517493','165','โครงงานวิจัย 1\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','3',30,2,28,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_517(1).xlsx',51,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(27,2569,1,'517','517493-165','517493','165','โครงงานวิจัย 1\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','4',30,3,27,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_517(1).xlsx',52,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(28,2569,1,'517','517493-165','517493','165','โครงงานวิจัย 1\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','5',30,3,27,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_517(1).xlsx',53,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(29,2569,1,'517','517493-165','517493','165','โครงงานวิจัย 1\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','6',30,4,26,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_517(1).xlsx',54,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(30,2569,1,'517','517493-2560','517493','2560','โครงงานวิจัย 1\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','1',30,1,29,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_517(1).xlsx',55,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(31,2569,1,'517','517493-2560','517493','2560','โครงงานวิจัย 1\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','2',30,0,30,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_517(1).xlsx',56,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(32,2569,1,'517','517493-2560','517493','2560','โครงงานวิจัย 1\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','3',30,0,30,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_517(1).xlsx',57,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(33,2569,1,'517','517493-2560','517493','2560','โครงงานวิจัย 1\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','4',30,0,30,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_517(1).xlsx',58,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(34,2569,1,'517','517493-2560','517493','2560','โครงงานวิจัย 1\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','5',30,1,29,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_517(1).xlsx',59,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(35,2569,1,'517','517493-2560','517493','2560','โครงงานวิจัย 1\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','6',30,0,30,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_517(1).xlsx',60,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(36,2569,1,'517','517493-55','517493','55','โครงงานวิจัย 1\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','1',30,0,30,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_517(1).xlsx',61,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(37,2569,1,'517','517493-55','517493','55','โครงงานวิจัย 1\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','2',30,0,30,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_517(1).xlsx',62,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(38,2569,1,'517','517493-55','517493','55','โครงงานวิจัย 1\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','3',30,0,30,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_517(1).xlsx',63,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(39,2569,1,'517','517493-55','517493','55','โครงงานวิจัย 1\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','4',30,0,30,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_517(1).xlsx',64,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(40,2569,1,'517','517493-55','517493','55','โครงงานวิจัย 1\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','5',30,0,30,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_517(1).xlsx',65,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(41,2569,1,'517','517493-55','517493','55','โครงงานวิจัย 1\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','6',30,0,30,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_517(1).xlsx',66,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(42,2569,1,'517','517494-165','517494','165','โครงงานวิจัย 2\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','1',9999,2,9997,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_517(1).xlsx',67,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(43,2569,1,'517','517494-165','517494','165','โครงงานวิจัย 2\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','2',9999,0,9999,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_517(1).xlsx',68,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(44,2569,1,'517','517494-165','517494','165','โครงงานวิจัย 2\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Su 08:30 - 12:05 1639 ว.1','3',9999,3,9996,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_517(1).xlsx',69,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(45,2569,1,'517','517494-165','517494','165','โครงงานวิจัย 2\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 19:25 - 21:10 1639 ว.1','4',9999,7,9992,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_517(1).xlsx',70,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(46,2569,1,'517','517494-165','517494','165','โครงงานวิจัย 2\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','5',9999,3,9996,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_517(1).xlsx',71,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(47,2569,1,'517','517494-165','517494','165','โครงงานวิจัย 2\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','6',9999,4,9995,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_517(1).xlsx',72,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(48,2569,1,'517','517494-2560','517494','2560','โครงงานวิจัย 2\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','1',9999,1,9998,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_517(1).xlsx',73,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(49,2569,1,'517','517494-2560','517494','2560','โครงงานวิจัย 2\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','2',9999,0,9999,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_517(1).xlsx',74,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(50,2569,1,'517','517494-2560','517494','2560','โครงงานวิจัย 2\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Su 08:30 - 12:05 1639 ว.1','3',9999,3,9996,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_517(1).xlsx',75,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(51,2569,1,'517','517494-2560','517494','2560','โครงงานวิจัย 2\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','4',9999,0,9999,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_517(1).xlsx',76,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(52,2569,1,'517','517494-2560','517494','2560','โครงงานวิจัย 2\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','5',9999,1,9998,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_517(1).xlsx',77,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(53,2569,1,'517','517494-2560','517494','2560','โครงงานวิจัย 2\n(บ.คอมปี6-8ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','6',9999,4,9995,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_517(1).xlsx',78,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(54,2569,1,'517','517494-55','517494','55','โครงงานวิจัย 2\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','1',9999,0,9999,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_517(1).xlsx',79,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(55,2569,1,'517','517494-55','517494','55','โครงงานวิจัย 2\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','2',9999,0,9999,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_517(1).xlsx',80,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(56,2569,1,'517','517494-55','517494','55','โครงงานวิจัย 2\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','3',9999,0,9999,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_517(1).xlsx',81,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(57,2569,1,'517','517494-55','517494','55','โครงงานวิจัย 2\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','4',9999,0,9999,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_517(1).xlsx',82,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(58,2569,1,'517','517494-55','517494','55','โครงงานวิจัย 2\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','5',9999,0,9999,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_517(1).xlsx',83,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(59,2569,1,'517','517494-55','517494','55','โครงงานวิจัย 2\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','6',9999,0,9999,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_517(1).xlsx',84,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(60,2569,1,'517','517791-366','517791','366','สัมมนาทางเทคโนโลยีสารสนเทศและนวัตกรรมดิจิทัล 1','SEMINAR IN INFORMATION TECHNOLOGY AND DIGITAL INNOVATION I','1 (0-2-1)','Tu 13:00 - 15:40 1638 ว.1','1',50,1,49,'W','ผู้ช่วยศาสตราจารย์ ดร.กรัญญา  สิทธิสงวน\nผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_517(1).xlsx',99,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(61,2569,1,'517','517793-366','517793','366','สัมมนาทางเทคโนโลยีสารสนเทศและนวัตกรรมดิจิทัล 3','SEMINAR IN INFORMATION TECHNOLOGY AND DIGITAL INNOVATION III','1 (0-2-1)','Tu 13:00 - 15:40 1638 ว.1','1',50,1,49,'W','ผู้ช่วยศาสตราจารย์ ดร.กรัญญา  สิทธิสงวน\nผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_517(1).xlsx',100,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(62,2569,1,'520','520101-165','520101','165','พื้นฐานคอมพิวเตอร์และวิทยาการสารสนเทศ\n(บ.สนเทศปี1)','FOUNDATION OF COMPUTER AND INFORMATICS','3 (2-2-5)','Fr 08:30 - 10:15 ร.วท.2\nFr 13:00 - 14:45 1227/1,1227/2 ว.1','1',101,101,0,'W','ผู้ช่วยศาสตราจารย์ ดร.กรัญญา  สิทธิสงวน\nอาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_520(1).xlsx',10,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(63,2569,1,'520','520213-165','520213','165','โครงสร้างข้อมูลพื้นฐานและการประยุกต์\n(บ.สนเทศปี2-4)','FUNDAMENTAL OF DATA STRUCTURES AND APPLICATIONS','3 (2-2-5)','Mo 08:30 - 10:15 1227/1,1227/2 ว.1\nTu 13:55 - 16:35 4203 ว.4','1',135,73,62,'W','ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','classlist2569_520(1).xlsx',11,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(64,2569,1,'520','520213-165','520213','165','โครงสร้างข้อมูลพื้นฐานและการประยุกต์\n(บ.สนเทศปี2ขึ้นไป)','FUNDAMENTAL OF DATA STRUCTURES AND APPLICATIONS','3 (2-2-5)','Tu 08:30 - 10:15 com ว.3\nTu 10:20 - 12:05 1241 ว.1','2',60,60,0,'W','ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','classlist2569_520(1).xlsx',12,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(65,2569,1,'520','520213-2560','520213','2560','โครงสร้างข้อมูลพื้นฐานและการประยุกต์\n(บ.สนเทศปี6-8)','FUNDAMENTALS OF DATA STRUCTURES AND APPLICATIONS','4 (3-2-7)','Mo 08:30 - 10:15 1227/1,1227/2 ว.1\nTu 13:55 - 16:35 4203 ว.4','1',20,0,20,'W','ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','classlist2569_520(1).xlsx',13,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(66,2569,1,'520','520214-1651','520214','1651','ดิจิทัลแพลตฟอร์มและโครงสร้างพื้นฐาน\n(บ.สนเทศปี2-5)','DIGITAL PLATFORM AND INFRASTRUCTURE','3 (2-2-5)','Tu 08:30 - 10:15 1239 ว.1\nTu 10:20 - 12:05 1227/1,1227/2 ว.1','1',100,64,36,'W','ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์\nผู้ช่วยศาสตราจารย์ ดร.คทา  ประดิษฐวงศ์','classlist2569_520(1).xlsx',14,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(67,2569,1,'520','520215-160','520215','160','พื้นฐานการเรียนรู้ของเครื่องเชิงสถิติ\n(บ.คอมปี6-8)','FUNDAMENTALS OF STATISTICAL MACHINE LEARNING','3 (2-2-5)','Th 10:20 - 12:05 1239 ว.1\nTh 14:50 - 16:35 1227/1,1227/2 ว.1','1',20,6,14,'W','ผู้ช่วยศาสตราจารย์ ดร.สุนีย์  พงษ์พินิจภิญโญ\nนายบูชาภัทร  ป้านศรี','classlist2569_520(1).xlsx',15,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(68,2569,1,'520','520231-165','520231','165','การวิเคราะห์ข้อมูล\n(บ.คอมปี2-5)','DATA ANALYTICS','3 (2-2-5)','Th 10:20 - 12:05 1239 ว.1\nTh 14:50 - 16:35 1227/1,1227/2 ว.1','1',87,87,0,'W','ผู้ช่วยศาสตราจารย์ ดร.สุนีย์  พงษ์พินิจภิญโญ\nนายบูชาภัทร  ป้านศรี','classlist2569_520(1).xlsx',16,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(69,2569,1,'520','520321-165','520321','165','การบริหารจัดการระบบฐานข้อมูล\n(บ.สนเทศปี3ขึ้นไป)','DATABASE SYSTEM ADMINISTRATION','3 (2-2-5)','Fr 13:00 - 14:45 ไววิทย์พุทธารี\nFr 14:50 - 16:35 1227/1,1227/2 ว.1','1',123,111,12,'W','ผู้ช่วยศาสตราจารย์ ดร.อรวรรณ  เชาวลิต','classlist2569_520(1).xlsx',19,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(70,2569,1,'520','520321-2560','520321','2560','การบริหารจัดการระบบฐานข้อมูล\n(บ.สนเทศปี6-8)','DATABASE SYSTEM ADMINISTRATION','3 (2-2-5)','Fr 13:00 - 14:45 ไววิทย์พุทธารี\nFr 14:50 - 16:35 1227/1,1227/2 ว.1','1',10,0,10,'W','ผู้ช่วยศาสตราจารย์ ดร.อรวรรณ  เชาวลิต','classlist2569_520(1).xlsx',20,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(71,2569,1,'520','520331-165','520331','165','ปัญญาประดิษฐ์สำหรับเทคโนโลยีสารสนเทศ\n(บ.สนเทศปี3ขึ้นไป)','ARTIFICIAL INTELLIGENCE FOR INFORMATION TECHNOLOGY','3 (2-2-5)','Th 13:00 - 14:45 410A-410B\nTh 14:50 - 16:35 410A-410B','1',94,87,7,'W','ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์','classlist2569_520(1).xlsx',23,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(72,2569,1,'520','520331-2560','520331','2560','ปัญญาประดิษฐ์สำหรับเทคโนโลยีสารสนเทศ\n(บ.สนเทศปี6-8 ตามรายชื่อ)','ARTFICIAL INTELLIGENCE FOR INFORMATION TECHNOLOGY','3 (2-2-5)','Th 13:00 - 14:45 410A-410B\nTh 14:50 - 16:35 410A-410B','1',0,0,0,'W','ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์','classlist2569_520(1).xlsx',24,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(73,2569,1,'520','520333-165','520333','165','การทำเหมืองข้อมูล\n(ล.คอม สนเทศปี3-5)','DATA MINING','3 (2-2-5)','We 08:30 - 12:05 1334 ว.1','1',40,5,35,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_520(1).xlsx',25,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(74,2569,1,'520','520335-165','520335','165','วิทยาการข้อมูลและเครื่องมือ\n(ล.สนเทศปี3 *ปิด*)','DATA SCIENCE AND TOOLS','3 (2-2-5)','We 13:00 - 14:45 410A-410B\nWe 14:50 - 16:35 410A-410B','1',0,0,0,'W','ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์','classlist2569_520(1).xlsx',27,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(75,2569,1,'520','520341-165','520341','165','การเขียนโปรแกรมแบบเว็บฝั่งไคลเอนต์\n(บ.สนเทศปี3-5)','CLIENT SIDE WEB PROGRAMMING','3 (2-2-5)','Th 08:30 - 10:15 410A-410B\nTh 10:20 - 12:05 410A-410B','1',104,103,1,'W','ผู้ช่วยศาสตราจารย์ ดร.สัจจาภรณ์  ไวจรรยา','classlist2569_520(1).xlsx',28,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(76,2569,1,'520','520341-2560','520341','2560','เทคโนโลยีและการเขียนโปรแกรมบนเครือข่ายอินเทอร์เน็ตและเวิลด์ไวด์เว็บ\n(บ.สนเทศ ล.คอม ปี6-8)','INTERNET AND WORLD WIDE WEB TECHNOLOGY AND PROGRAMMING','3 (2-2-5)','Mo 13:00 - 14:45 1239 ว.1\nMo 14:50 - 16:35 1227/2 ว.1','1',9999,19,9980,'W','อาจารย์เสฐลัทธ์  รอดเหตุภัย','classlist2569_520(1).xlsx',29,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(77,2569,1,'520','520342-165','520342','165','การเขียนโปรแกรมแบบเว็บฝั่งเซิร์ฟเวอร์\n(บ.สนเทศปี3-5)','SERVER SIDE WEB PROGRAMMING','3 (2-2-5)','We 08:30 - 10:15 410A-410B\nWe 10:20 - 12:05 410A-410B','1',104,103,1,'W','ผู้ช่วยศาสตราจารย์ ดร.สัจจาภรณ์  ไวจรรยา\nผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์','classlist2569_520(1).xlsx',30,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(78,2569,1,'520','520342-2560','520342','2560','สถาปัตยกรรมและเทคโนโลยีเครือข่ายคอมพิวเตอร์\n(บ.สนเทศปี6-8)','COMPUTER NETWORK ARCHITECTURE AND TECHNOLOGY','3 (2-2-5)','Th 08:30 - 10:15 1227/2 ว.1\nTh 10:20 - 12:05 1227/2 ว.1','1',9999,16,9983,'W','อาจารย์เสฐลัทธ์  รอดเหตุภัย','classlist2569_520(1).xlsx',31,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(79,2569,1,'520','520346-165','520346','165','การพัฒนาโปรแกรมประยุกต์บนอุปกรณ์เคลื่อนที่สำหรับธุรกิจ\n(บ.สนเทศปี3-4)','MOBILE APPLICATION DEVELOPMENT FOR BUSINESS','3 (2-2-5)','Sa 08:30 - 10:15 1227/1,1227/2 ว.1\nSa 10:20 - 12:05 1227/1,1227/2 ว.1','1',80,46,34,'W','ผู้ช่วยศาสตราจารย์ ดร.อรวรรณ  เชาวลิต','classlist2569_520(1).xlsx',32,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(80,2569,1,'520','520354-165','520354','165','ระบบปฏิบัติการหุ่นยนต์และการควบคุม\n(ล.สารสนเทศ ปี 3-5)','ROBOT OPERATING SYSTEM AND CONTROL','3 (2-2-5)','We 08:30 - 12:05 1639 ว.1','1',10,0,10,'W','ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','classlist2569_520(1).xlsx',35,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(81,2569,1,'520','520393-165','520393','165','การเตรียมโครงงานวิจัย\n(บ.คอมปี3ขึ้นไป)','RESEARCH PROJECT PREPARATION','1 (0-2-1)','Mo 12:10 - 12:55 1639 ว.1\nTu 12:10 - 12:55 1639 ว.1','1',20,4,16,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น\nผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์อภิเษก  หงษ์วิทยากร\nผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์\nอาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต\nอาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_520(1).xlsx',41,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(82,2569,1,'520','520484-165','520484','165','เรื่องคัดเฉพาะทางเทคโนโลยีสารสนเทศ 4\n(บ.สนเทศปี3ขึ้นไป)','SELECTED TOPICS IN INFORMATION TECHNOLOGY IV','3 (2-2-5)','Mo 14:50 - 16:35 1240 ว.1\nWe 16:40 - 18:25 1227/2 ว.1','1',10,0,10,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_520(1).xlsx',46,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(83,2569,1,'520','520486-165','520486','165','เรื่องคัดเฉพาะทางเทคโนโลยีสารสนเทศ 6\n(ล.สารสนเทศปี4ขึ้นไป)','SELECTED TOPICS IN INFORMATION TECHNOLOGY VI','3 (2-2-5)','Tu 13:00 - 15:40 1639 ว.1','1',30,3,27,'W','รองศาสตราจารย์ ดร.ปานใจ  ธารทัศนวงศ์','classlist2569_520(1).xlsx',48,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(84,2569,1,'520','520487-2560','520487','2560','เรื่องคัดเฉพาะทางเทคโนโลยีสารสนเทศ 7\n(ล.สนเทศปี6-8)','SELECTED TOPICS IN INFORMATION TECHNOLOGY VII','3 (2-2-5)','Tu 13:00 - 15:40 1639 ว.1','1',30,9,21,'W','รองศาสตราจารย์ ดร.ปานใจ  ธารทัศนวงศ์','classlist2569_520(1).xlsx',49,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(85,2569,1,'520','520493-165','520493','165','โครงงานวิจัย 1\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Tu 16:40 - 18:25 1639 ว.1','1',30,4,26,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_520(1).xlsx',50,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(86,2569,1,'520','520493-165','520493','165','โครงงานวิจัย 1\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','2',30,2,28,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_520(1).xlsx',51,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(87,2569,1,'520','520493-165','520493','165','โครงงานวิจัย 1\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','3',30,1,29,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_520(1).xlsx',52,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(88,2569,1,'520','520493-165','520493','165','โครงงานวิจัย 1\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','4',30,9,21,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_520(1).xlsx',53,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(89,2569,1,'520','520493-165','520493','165','โครงงานวิจัย 1\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Su 06:30 - 08:30 1639 ว.1','5',30,12,18,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_520(1).xlsx',54,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(90,2569,1,'520','520493-165','520493','165','โครงงานวิจัย 1\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','6',30,3,27,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_520(1).xlsx',55,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(91,2569,1,'520','520493-2560','520493','2560','โครงงานวิจัย 1\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Tu 16:40 - 18:25 1639 ว.1','1',30,2,28,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_520(1).xlsx',56,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(92,2569,1,'520','520493-2560','520493','2560','โครงงานวิจัย 1\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','2',30,1,29,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_520(1).xlsx',57,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(93,2569,1,'520','520493-2560','520493','2560','โครงงานวิจัย 1\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','3',30,0,30,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_520(1).xlsx',58,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(94,2569,1,'520','520493-2560','520493','2560','โครงงานวิจัย 1\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','4',30,0,30,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_520(1).xlsx',59,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(95,2569,1,'520','520493-2560','520493','2560','โครงงานวิจัย 1\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Su 06:30 - 08:30 1639 ว.1','5',30,0,30,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_520(1).xlsx',60,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(96,2569,1,'520','520493-2560','520493','2560','โครงงานวิจัย 1\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','6',30,1,29,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_520(1).xlsx',61,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(97,2569,1,'520','520493-55','520493','55','โครงงานวิจัย 1\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','1',30,0,30,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_520(1).xlsx',62,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(98,2569,1,'520','520493-55','520493','55','โครงงานวิจัย 1\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','2',30,0,30,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_520(1).xlsx',63,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(99,2569,1,'520','520493-55','520493','55','โครงงานวิจัย 1\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','3',30,0,30,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_520(1).xlsx',64,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(100,2569,1,'520','520493-55','520493','55','โครงงานวิจัย 1\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','4',30,0,30,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_520(1).xlsx',65,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(101,2569,1,'520','520493-55','520493','55','โครงงานวิจัย 1\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Su 06:30 - 08:30 1639 ว.1','5',30,0,30,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_520(1).xlsx',66,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(102,2569,1,'520','520493-55','520493','55','โครงงานวิจัย 1\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT I','1 (0-2-1)','Mo 12:10 - 13:50 1639 ว.1','6',30,0,30,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_520(1).xlsx',67,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(103,2569,1,'520','520494-165','520494','165','โครงงานวิจัย 2\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','1',9999,3,9996,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_520(1).xlsx',68,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(104,2569,1,'520','520494-165','520494','165','โครงงานวิจัย 2\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','2',9999,3,9996,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_520(1).xlsx',69,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(105,2569,1,'520','520494-165','520494','165','โครงงานวิจัย 2\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Su 08:30 - 12:05 1639 ว.1','3',9999,7,9992,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_520(1).xlsx',70,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(106,2569,1,'520','520494-165','520494','165','โครงงานวิจัย 2\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','4',9999,0,9999,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_520(1).xlsx',71,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(107,2569,1,'520','520494-165','520494','165','โครงงานวิจัย 2\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','5',9999,4,9995,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_520(1).xlsx',72,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(108,2569,1,'520','520494-165','520494','165','โครงงานวิจัย 2\n(บ.สนเทศปี4 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','6',9999,5,9994,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_520(1).xlsx',73,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(109,2569,1,'520','520494-2560','520494','2560','โครงงานวิจัย 2\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 16:40 - 18:25 1639 ว.1\nTu 16:40 - 18:25 1639 ว.1','1',9999,8,9991,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_520(1).xlsx',74,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(110,2569,1,'520','520494-2560','520494','2560','โครงงานวิจัย 2\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','2',9999,0,9999,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_520(1).xlsx',75,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(111,2569,1,'520','520494-2560','520494','2560','โครงงานวิจัย 2\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Su 08:30 - 12:05 1639 ว.1','3',9999,7,9992,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_520(1).xlsx',76,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(112,2569,1,'520','520494-2560','520494','2560','โครงงานวิจัย 2\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 07:40 - 09:20 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','4',9999,5,9994,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_520(1).xlsx',77,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(113,2569,1,'520','520494-2560','520494','2560','โครงงานวิจัย 2\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','5',9999,2,9997,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_520(1).xlsx',78,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(114,2569,1,'520','520494-2560','520494','2560','โครงงานวิจัย 2\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','6',9999,4,9995,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_520(1).xlsx',79,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(115,2569,1,'520','520494-55','520494','55','โครงงานวิจัย 2\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','1',9999,0,9999,'W','อาจารย์ ดร.วัสรา  รอดเหตุภัย','classlist2569_520(1).xlsx',80,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(116,2569,1,'520','520494-55','520494','55','โครงงานวิจัย 2\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','2',9999,0,9999,'W','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','classlist2569_520(1).xlsx',81,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(117,2569,1,'520','520494-55','520494','55','โครงงานวิจัย 2\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','3',9999,0,9999,'W','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','classlist2569_520(1).xlsx',82,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(118,2569,1,'520','520494-55','520494','55','โครงงานวิจัย 2\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','4',9999,0,9999,'W','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','classlist2569_520(1).xlsx',83,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(119,2569,1,'520','520494-55','520494','55','โครงงานวิจัย 2\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','5',9999,0,9999,'W','อาจารย์อภิเษก  หงษ์วิทยากร','classlist2569_520(1).xlsx',84,'2026-10-10 14:07:16','2026-10-10 14:07:16'),(120,2569,1,'520','520494-55','520494','55','โครงงานวิจัย 2\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT II','2 (0-4-2)','Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1','6',9999,0,9999,'W','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','classlist2569_520(1).xlsx',85,'2026-10-10 14:07:16','2026-10-10 14:07:16');
/*!40000 ALTER TABLE `classlist_courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `core_courses`
--

DROP TABLE IF EXISTS `core_courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `core_courses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `program` varchar(10) NOT NULL,
  `code` varchar(20) NOT NULL,
  `title` varchar(300) NOT NULL,
  `credits` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_core_courses_program_code` (`program`,`code`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `core_courses`
--

LOCK TABLES `core_courses` WRITE;
/*!40000 ALTER TABLE `core_courses` DISABLE KEYS */;
INSERT INTO `core_courses` VALUES (1,'IT','517121','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1',NULL),(2,'IT','517122','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 2',NULL),(3,'CS','517121','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1',NULL),(4,'CS','517122','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 2',NULL);
/*!40000 ALTER TABLE `core_courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `course_instructors`
--

DROP TABLE IF EXISTS `course_instructors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_instructors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `course_id` bigint unsigned NOT NULL,
  `instructor_id` bigint unsigned NOT NULL,
  `source` enum('imported','self_added') NOT NULL DEFAULT 'imported',
  `created_at` datetime(3) DEFAULT NULL,
  `archived_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_ci_course_instructor` (`course_id`,`instructor_id`),
  KEY `idx_course_instructors_course_id` (`course_id`),
  KEY `idx_course_instructors_instructor_id` (`instructor_id`),
  CONSTRAINT `fk_course_instructors_course_id` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_course_instructors_instructor_id` FOREIGN KEY (`instructor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=497 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `course_instructors`
--

LOCK TABLES `course_instructors` WRITE;
/*!40000 ALTER TABLE `course_instructors` DISABLE KEYS */;
INSERT INTO `course_instructors` VALUES (1,1,9,'imported','2026-10-10 14:07:16.494',NULL),(2,2,14,'imported','2026-10-10 14:07:16.503',NULL),(3,3,9,'imported','2026-10-10 14:07:16.514',NULL),(4,4,15,'imported','2026-10-10 14:07:16.523',NULL),(5,5,15,'imported','2026-10-10 14:07:16.531',NULL),(6,6,15,'imported','2026-10-10 14:07:16.540',NULL),(7,7,15,'imported','2026-10-10 14:07:16.550',NULL),(8,8,15,'imported','2026-10-10 14:07:16.557',NULL),(9,9,15,'imported','2026-10-10 14:07:16.565',NULL),(10,10,9,'imported','2026-10-10 14:07:16.573',NULL),(11,11,16,'imported','2026-10-10 14:07:16.583',NULL),(12,12,12,'imported','2026-10-10 14:07:16.590',NULL),(13,13,12,'imported','2026-10-10 14:07:16.599',NULL),(14,16,4,'imported','2026-10-10 14:07:16.620',NULL),(15,17,11,'imported','2026-10-10 14:07:16.627',NULL),(16,19,14,'imported','2026-10-10 14:07:16.640',NULL),(17,20,14,'imported','2026-10-10 14:07:16.646',NULL),(18,21,15,'imported','2026-10-10 14:07:16.653',NULL),(19,22,15,'imported','2026-10-10 14:07:16.663',NULL),(20,23,18,'imported','2026-10-10 14:07:16.671',NULL),(21,24,16,'imported','2026-10-10 14:07:16.678',NULL),(22,25,3,'imported','2026-10-10 14:07:16.685',NULL),(23,26,17,'imported','2026-10-10 14:07:16.694',NULL),(24,27,16,'imported','2026-10-10 14:07:16.700',NULL),(25,28,2,'imported','2026-10-10 14:07:16.706',NULL),(26,29,15,'imported','2026-10-10 14:07:16.714',NULL),(27,30,14,'imported','2026-10-10 14:07:16.722',NULL),(28,31,12,'imported','2026-10-10 14:07:16.728',NULL),(29,32,9,'imported','2026-10-10 14:07:16.736',NULL),(30,33,16,'imported','2026-10-10 14:07:16.742',NULL),(31,34,2,'imported','2026-10-10 14:07:16.750',NULL),(32,35,15,'imported','2026-10-10 14:07:16.759',NULL),(33,36,14,'imported','2026-10-10 14:07:16.766',NULL),(34,37,12,'imported','2026-10-10 14:07:16.773',NULL),(35,38,9,'imported','2026-10-10 14:07:16.781',NULL),(37,40,15,'imported','2026-10-10 14:07:16.796',NULL),(38,41,1,'imported','2026-10-10 14:07:16.804',NULL),(39,42,1,'imported','2026-10-10 14:07:16.811',NULL),(40,43,1,'imported','2026-10-10 14:07:16.817',NULL),(41,44,3,'imported','2026-10-10 14:07:16.823',NULL),(42,45,3,'imported','2026-10-10 14:07:16.829',NULL),(43,46,3,'imported','2026-10-10 14:07:16.838',NULL),(44,47,4,'imported','2026-10-10 14:07:16.846',NULL),(45,48,6,'imported','2026-10-10 14:07:16.853',NULL),(46,49,6,'imported','2026-10-10 14:07:16.861',NULL),(47,50,8,'imported','2026-10-10 14:07:16.869',NULL),(48,51,4,'imported','2026-10-10 14:07:16.876',NULL),(49,52,9,'imported','2026-10-10 14:07:16.883',NULL),(50,53,4,'imported','2026-10-10 14:07:16.893',NULL),(51,54,10,'imported','2026-10-10 14:07:16.899',NULL),(52,55,11,'imported','2026-10-10 14:07:16.907',NULL),(53,56,10,'imported','2026-10-10 14:07:16.914',NULL),(54,57,11,'imported','2026-10-10 14:07:16.921',NULL),(55,58,8,'imported','2026-10-10 14:07:16.928',NULL),(56,59,3,'imported','2026-10-10 14:07:16.935',NULL),(57,60,14,'imported','2026-10-10 14:07:16.943',NULL),(58,61,14,'imported','2026-10-10 14:07:17.187',NULL),(59,62,15,'imported','2026-10-10 14:07:17.326',NULL),(60,63,15,'imported','2026-10-10 14:07:17.334',NULL),(61,64,13,'imported','2026-10-10 14:07:17.342',NULL),(62,65,13,'imported','2026-10-10 14:07:17.349',NULL),(63,66,16,'imported','2026-10-10 14:07:17.357',NULL),(64,67,2,'imported','2026-10-10 14:07:17.364',NULL),(65,68,15,'imported','2026-10-10 14:07:17.373',NULL),(66,69,14,'imported','2026-10-10 14:07:17.381',NULL),(67,70,12,'imported','2026-10-10 14:07:17.388',NULL),(68,71,9,'imported','2026-10-10 14:07:17.395',NULL),(69,72,16,'imported','2026-10-10 14:07:17.404',NULL),(70,73,16,'imported','2026-10-10 14:07:17.411',NULL),(71,74,2,'imported','2026-10-10 14:07:17.418',NULL),(72,75,15,'imported','2026-10-10 14:07:17.426',NULL),(73,76,14,'imported','2026-10-10 14:07:17.435',NULL),(74,77,12,'imported','2026-10-10 14:07:17.445',NULL),(75,78,9,'imported','2026-10-10 14:07:17.452',NULL),(77,80,16,'imported','2026-10-10 14:07:17.467',NULL),(79,82,15,'imported','2026-10-10 14:07:17.482',NULL),(80,19,15,'imported','2026-10-10 14:07:17.493',NULL),(81,19,12,'imported','2026-10-10 14:07:17.493',NULL),(82,19,9,'imported','2026-10-10 14:07:17.493',NULL),(83,19,2,'imported','2026-10-10 14:07:17.493',NULL),(84,19,16,'imported','2026-10-10 14:07:17.493',NULL),(85,20,15,'imported','2026-10-10 14:07:17.493',NULL),(86,20,12,'imported','2026-10-10 14:07:17.493',NULL),(87,20,9,'imported','2026-10-10 14:07:17.493',NULL),(88,20,2,'imported','2026-10-10 14:07:17.493',NULL),(89,20,16,'imported','2026-10-10 14:07:17.493',NULL),(90,41,14,'imported','2026-10-10 14:07:17.493',NULL),(91,42,14,'imported','2026-10-10 14:07:17.493',NULL),(92,43,2,'imported','2026-10-10 14:07:17.493',NULL),(93,47,5,'imported','2026-10-10 14:07:17.493',NULL),(94,48,7,'imported','2026-10-10 14:07:17.493',NULL),(95,49,7,'imported','2026-10-10 14:07:17.493',NULL),(96,56,4,'imported','2026-10-10 14:07:17.493',NULL),(97,60,15,'imported','2026-10-10 14:07:17.493',NULL),(98,60,12,'imported','2026-10-10 14:07:17.493',NULL),(99,60,9,'imported','2026-10-10 14:07:17.493',NULL),(100,60,2,'imported','2026-10-10 14:07:17.493',NULL),(101,60,16,'imported','2026-10-10 14:07:17.493',NULL),(102,61,15,'imported','2026-10-10 14:07:17.493',NULL),(103,61,12,'imported','2026-10-10 14:07:17.493',NULL),(104,61,9,'imported','2026-10-10 14:07:17.493',NULL),(105,61,2,'imported','2026-10-10 14:07:17.493',NULL),(106,61,16,'imported','2026-10-10 14:07:17.493',NULL),(495,83,18,'imported','2026-10-10 14:16:32.695',NULL);
/*!40000 ALTER TABLE `course_instructors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(20) NOT NULL,
  `title` varchar(300) NOT NULL,
  `english_title` varchar(300) DEFAULT NULL,
  `group_note` varchar(200) DEFAULT NULL,
  `credits` varchar(20) DEFAULT NULL,
  `section` bigint DEFAULT '0',
  `slot` bigint DEFAULT '0',
  `schedule` varchar(500) DEFAULT NULL,
  `capacity` bigint DEFAULT '0',
  `enrolled` bigint DEFAULT '0',
  `instructor_id` bigint unsigned DEFAULT NULL,
  `instructors_raw` varchar(500) DEFAULT NULL,
  `semester` varchar(10) NOT NULL,
  `academic_year` bigint NOT NULL,
  `has_lab` tinyint(1) DEFAULT '0',
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_course_time_slot` (`code`,`section`,`slot`,`semester`,`academic_year`),
  KEY `idx_courses_instructor_id` (`instructor_id`),
  CONSTRAINT `fk_courses_instructor_id` FOREIGN KEY (`instructor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=84 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courses`
--

LOCK TABLES `courses` WRITE;
/*!40000 ALTER TABLE `courses` DISABLE KEYS */;
INSERT INTO `courses` VALUES (1,'517100','ความรอบรู้ทางด้านสารสนเทศและคอมพิวเตอร์\n(ล.เสรีทุกคณะทุกชั้นปี)','COMPUTER AND INFORMATION LITERACY','','3 (2-2-5)',1,0,'We 16:40 - 20:15 5406 ว.4',180,179,9,'ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','1',2569,1,'2026-10-10 14:07:16.494','2026-10-10 14:07:16.494'),(2,'517101','ความรอบรู้และความเป็นพลเมืองดิจิทัล\n(บ.คอมปี1)','DIGITAL LITERACY AND CITIZENSHIP','','3 (2-2-5)',1,0,'We 08:30 - 10:15 1227/1,1227/2 ว.1\nWe 10:20 - 12:05 1227/1,1227/2 ว.1',100,87,14,'ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','1',2569,1,'2026-10-10 14:07:16.502','2026-10-10 14:07:16.502'),(3,'517111','การเขียนโปรแกรมคอมพิวเตอร์สำหรับนักวิทยาการข้อมูล\n(บ.วิทข้อมูลปี1)','COMPUTER PROGRAMMING FOR DATA SCIENTISTS','','3 (2-2-5)',1,0,'Mo 10:20 - 12:05 1239 ว.1\nMo 13:00 - 14:45 1227/1,1227/2 ว.1',80,50,9,'ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','1',2569,1,'2026-10-10 14:07:16.514','2026-10-10 14:07:16.514'),(4,'517121','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1','COMPUTER PROGRAMMING SKILL I','','4 (2-4-6)',1,0,'Mo 10:20 - 12:05 ร.วท.2',210,98,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี\nผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์','1',2569,1,'2026-10-10 14:07:16.522','2026-10-10 14:07:16.522'),(5,'517121','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1','COMPUTER PROGRAMMING SKILL I','','4 (2-4-6)',1,1,'Tu 13:00 - 16:35 1227/1,1227/2 ว.1',210,98,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี\nผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์','1',2569,1,'2026-10-10 14:07:16.530','2026-10-10 14:07:16.530'),(6,'517121','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1','COMPUTER PROGRAMMING SKILL I','','4 (2-4-6)',1,2,'Fr 16:40 - 18:25 1227/1,1227/2 ว.1',210,98,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี\nผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์','1',2569,1,'2026-10-10 14:07:16.540','2026-10-10 14:07:16.540'),(7,'517121','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1','COMPUTER PROGRAMMING SKILL I','','4 (2-4-6)',2,0,'Mo 10:20 - 12:05 ร.วท.2',205,103,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี\nผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์','1',2569,1,'2026-10-10 14:07:16.549','2026-10-10 14:07:16.549'),(8,'517121','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1','COMPUTER PROGRAMMING SKILL I','','4 (2-4-6)',2,1,'We 13:00 - 16:35 1227/1,1227/2 ว.1',205,103,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี\nผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์','1',2569,1,'2026-10-10 14:07:16.557','2026-10-10 14:07:16.557'),(9,'517121','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1','COMPUTER PROGRAMMING SKILL I','','4 (2-4-6)',2,2,'Fr 16:40 - 18:25 1334 ว.1',205,103,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี\nผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์','1',2569,1,'2026-10-10 14:07:16.565','2026-10-10 14:07:16.565'),(10,'517123','การเขียนโปรแกรมคอมพิวเตอร์สำหรับนักวิทยาการข้อมูล\n(พบผู้สอนก่อนลงทะเบียน)','COMPUTER PROGRAMMING FOR DATA SCIENTISTS','','3 (2-2-5)',1,0,'Mo 10:20 - 12:05 1239 ว.1\nMo 13:00 - 14:45 1227/1,1227/2 ว.1',0,0,9,'ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','1',2569,1,'2026-10-10 14:07:16.573','2026-10-10 14:07:16.573'),(11,'517211','โครงสร้างข้อมูล','DATA STRUCTURES','','3 (2-2-5)',1,0,'Tu 08:30 - 10:15 1227/1,1227/2 ว.1\nTu 13:00 - 15:40 1239 ว.1',120,93,16,'อาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:16.582','2026-10-10 14:07:16.582'),(12,'517212','การออกแบบวงจรตรรกะเชิงเลข\n(บ.คอม ปี6-8)','DIGITAL LOGIC DESIGN','','4 (3-2-7)',1,0,'Mo 13:00 - 15:40 410A-410B',40,0,12,'อาจารย์อภิเษก  หงษ์วิทยากร','1',2569,1,'2026-10-10 14:07:16.590','2026-10-10 14:07:16.590'),(13,'517212','การออกแบบวงจรตรรกะเชิงเลข\n(บ.คอม ปี6-8)','DIGITAL LOGIC DESIGN','','4 (3-2-7)',1,1,'Fr 08:30 - 10:15 410A-410B',40,0,12,'อาจารย์อภิเษก  หงษ์วิทยากร','1',2569,1,'2026-10-10 14:07:16.598','2026-10-10 14:07:16.598'),(14,'517214','โครงสร้างข้อมูลพื้นฐานสำหรับวิทยาการข้อมูล','FUNDAMENTALS OF DATA STRUCTURES FOR DATA SCIENCE','','3 (2-2-5)',1,0,'We 14:50 - 16:35 1239 ว.1',89,76,NULL,'ผู้ช่วยศาสตราจารย์ ดร.ทัศนวรรณ  ศูนย์กลาง','1',2569,1,'2026-10-10 14:07:16.606','2026-10-10 14:07:16.606'),(15,'517214','โครงสร้างข้อมูลพื้นฐานสำหรับวิทยาการข้อมูล','FUNDAMENTALS OF DATA STRUCTURES FOR DATA SCIENCE','','3 (2-2-5)',1,1,'Th 13:00 - 14:45 1334 ว.1',89,76,NULL,'ผู้ช่วยศาสตราจารย์ ดร.ทัศนวรรณ  ศูนย์กลาง','1',2569,1,'2026-10-10 14:07:16.613','2026-10-10 14:07:16.613'),(16,'517331','ปัญญาประดิษฐ์\n(ล.คอมปี6-8)','ARTIFICIAL INTELLIGENCE','','3 (2-2-5)',1,0,'Th 13:00 - 14:45 410A-410B\nTh 14:50 - 16:35 410A-410B',10,4,4,'ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์','1',2569,1,'2026-10-10 14:07:16.619','2026-10-10 14:07:16.619'),(17,'517341','สถาปัตยกรรมและเทคโนโลยีเครือข่ายคอมพิวเตอร์\n(ล.คอมปี6-8)','COMPUTER NETWORK ARCHITECTURE AND TECHNOLOGY','','3 (2-2-5)',1,0,'Th 08:30 - 10:15 1227/2 ว.1\nTh 10:20 - 12:05 1227/2 ว.1',9999,0,11,'อาจารย์เสฐลัทธ์  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:16.626','2026-10-10 14:07:16.626'),(18,'517354','การประมวลผลสัญญาณดิจิทัล\n(ล.คอมปี3-4 (นศ.นำคอมมาเอง))','DIGITAL SIGNAL PROCESSING','','3 (2-2-5)',1,0,'Tu 08:30 - 10:15 1639 ว.1\nTu 10:20 - 12:05 1639 ว.1',30,15,NULL,'อาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี','1',2569,1,'2026-10-10 14:07:16.633','2026-10-10 14:07:16.633'),(19,'517392','การเตรียมความพร้อมสำหรับโครงงานวิจัย\n(บ.คอมปี3ขึ้นไป)','PREPARATION OF RESEARCH PROJECT','','1 (0-2-1)',1,0,'Mo 12:10 - 12:55 1639 ว.1',20,6,14,'ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น\nผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์อภิเษก  หงษ์วิทยากร\nผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์\nอาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต\nอาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:16.639','2026-10-10 14:07:16.639'),(20,'517392','การเตรียมความพร้อมสำหรับโครงงานวิจัย\n(บ.คอมปี3ขึ้นไป)','PREPARATION OF RESEARCH PROJECT','','1 (0-2-1)',1,1,'Tu 12:10 - 12:55 1639 ว.1',20,6,14,'ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น\nผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์อภิเษก  หงษ์วิทยากร\nผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์\nอาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต\nอาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:16.646','2026-10-10 14:07:16.646'),(21,'517431','การเรียนรู้ของเครื่อง\n(ล.คอมปี3)','MACHINE LEARNING','','3 (2-2-5)',1,0,'Mo 14:50 - 16:35 1240 ว.1',51,49,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','1',2569,1,'2026-10-10 14:07:16.653','2026-10-10 14:07:16.653'),(22,'517431','การเรียนรู้ของเครื่อง\n(ล.คอมปี3)','MACHINE LEARNING','','3 (2-2-5)',1,1,'We 16:40 - 18:25 1227/2 ว.1',51,49,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','1',2569,1,'2026-10-10 14:07:16.662','2026-10-10 14:07:16.662'),(23,'517433','การเรียนรู้เชิงลึกสำหรับคอมพิวเตอร์วิทัศน์','DEEP LEARNING FOR COMPUTER VISION','','3 (2-2-5)',1,0,'Mo 08:30 - 12:05 1639 ว.1',25,22,18,'อาจารย์ ดร.ภูริวัจน์  วรวิชัยพัฒน์','1',2569,1,'2026-10-10 14:07:16.670','2026-10-10 14:07:16.670'),(24,'517443','การจัดการความมั่นคงปลอดภัยทางไซเบอร์\n(ล.คอมปี3 (นศ.นำคอมมาเอง))','CYBERSECURITY MANAGEMENT','','3 (2-2-5)',1,0,'Th 08:30 - 10:15 1227/2 ว.1\nTh 10:20 - 12:05 1227/1 ว.1',30,22,16,'อาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:16.677','2026-10-10 14:07:16.677'),(25,'517461','ระบบปฏิบัติการหุ่นยนต์และการควบคุม\n(ล.คอมปี3-5 พบผู้สอนก่อนลงทะเบียน)','ROBOT OPERATING SYSTEM AND CONTROL','','3 (2-2-5)',1,0,'We 08:30 - 12:05 1639 ว.1',10,0,3,'ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','1',2569,1,'2026-10-10 14:07:16.684','2026-10-10 14:07:16.684'),(26,'517465','วิศวกรรมคุณลักษณะ\n(ล.คอมปี3)','FEATURE ENGINEERING','','3 (2-2-5)',1,0,'Fr 08:30 - 10:15 1639 ว.1\nFr 10:20 - 12:05 1639 ว.1',30,9,17,'ผู้ช่วยศาสตราจารย์ ดร.รัชดาพร  คณาวงษ์','1',2569,1,'2026-10-10 14:07:16.693','2026-10-10 14:07:16.693'),(27,'517493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',1,0,'Mo 12:10 - 13:50 1639 ว.1',90,1,16,'อาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:16.700','2026-10-10 14:07:16.700'),(28,'517493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',2,0,'Mo 12:10 - 13:50 1639 ว.1',90,10,2,'อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','1',2569,1,'2026-10-10 14:07:16.706','2026-10-10 14:07:16.706'),(29,'517493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',3,0,'Mo 12:10 - 13:50 1639 ว.1',90,2,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','1',2569,1,'2026-10-10 14:07:16.713','2026-10-10 14:07:16.713'),(30,'517493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',4,0,'Mo 12:10 - 13:50 1639 ว.1',90,3,14,'ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','1',2569,1,'2026-10-10 14:07:16.721','2026-10-10 14:07:16.721'),(31,'517493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',5,0,'Mo 12:10 - 13:50 1639 ว.1',90,4,12,'อาจารย์อภิเษก  หงษ์วิทยากร','1',2569,1,'2026-10-10 14:07:16.727','2026-10-10 14:07:16.727'),(32,'517493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',6,0,'Mo 12:10 - 13:50 1639 ว.1',90,4,9,'ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','1',2569,1,'2026-10-10 14:07:16.735','2026-10-10 14:07:16.735'),(33,'517494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',1,0,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,3,16,'อาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:16.741','2026-10-10 14:07:16.741'),(34,'517494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',2,0,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,0,2,'อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','1',2569,1,'2026-10-10 14:07:16.749','2026-10-10 14:07:16.749'),(35,'517494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',3,0,'Su 08:30 - 12:05 1639 ว.1',9999,6,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','1',2569,1,'2026-10-10 14:07:16.756','2026-10-10 14:07:16.756'),(36,'517494','โครงงานวิจัย 2\n(บ.คอมปี4ตามรายชื่อ)','RESEARCH PROJECT II','','2 (0-4-2)',4,0,'Mo 12:10 - 13:50 1639 ว.1\nMo 19:25 - 21:10 1639 ว.1\nMo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,7,14,'ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','1',2569,1,'2026-10-10 14:07:16.766','2026-10-10 14:07:17.517'),(37,'517494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',5,0,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,4,12,'อาจารย์อภิเษก  หงษ์วิทยากร','1',2569,1,'2026-10-10 14:07:16.772','2026-10-10 14:07:16.772'),(38,'517494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',6,0,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,8,9,'ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','1',2569,1,'2026-10-10 14:07:16.780','2026-10-10 14:07:16.780'),(40,'517494','โครงงานวิจัย 2\n(บ.คอมปีตกค้างตามรายชื่อ)','RESEARCH PROJECT II','','2 (0-4-2)',3,1,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,0,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','1',2569,1,'2026-10-10 14:07:16.795','2026-10-10 14:07:16.795'),(41,'517791','สัมมนาทางเทคโนโลยีสารสนเทศและนวัตกรรมดิจิทัล 1','SEMINAR IN INFORMATION TECHNOLOGY AND DIGITAL INNOVATION I','','1 (0-2-1)',1,0,'Tu 13:00 - 15:40 1638 ว.1',50,1,1,'ผู้ช่วยศาสตราจารย์ ดร.กรัญญา  สิทธิสงวน\nผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','1',2569,1,'2026-10-10 14:07:16.803','2026-10-10 14:07:16.803'),(42,'517793','สัมมนาทางเทคโนโลยีสารสนเทศและนวัตกรรมดิจิทัล 3','SEMINAR IN INFORMATION TECHNOLOGY AND DIGITAL INNOVATION III','','1 (0-2-1)',1,0,'Tu 13:00 - 15:40 1638 ว.1',50,1,1,'ผู้ช่วยศาสตราจารย์ ดร.กรัญญา  สิทธิสงวน\nผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','1',2569,1,'2026-10-10 14:07:16.810','2026-10-10 14:07:16.810'),(43,'520101','พื้นฐานคอมพิวเตอร์และวิทยาการสารสนเทศ\n(บ.สนเทศปี1)','FOUNDATION OF COMPUTER AND INFORMATICS','','3 (2-2-5)',1,0,'Fr 08:30 - 10:15 ร.วท.2\nFr 13:00 - 14:45 1227/1,1227/2 ว.1',101,101,1,'ผู้ช่วยศาสตราจารย์ ดร.กรัญญา  สิทธิสงวน\nอาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','1',2569,1,'2026-10-10 14:07:16.816','2026-10-10 14:07:16.816'),(44,'520213','โครงสร้างข้อมูลพื้นฐานและการประยุกต์','FUNDAMENTAL OF DATA STRUCTURES AND APPLICATIONS','','3 (2-2-5)',1,0,'Mo 08:30 - 10:15 1227/1,1227/2 ว.1',155,73,3,'ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','1',2569,1,'2026-10-10 14:07:16.822','2026-10-10 14:07:16.822'),(45,'520213','โครงสร้างข้อมูลพื้นฐานและการประยุกต์','FUNDAMENTAL OF DATA STRUCTURES AND APPLICATIONS','','3 (2-2-5)',1,1,'Tu 13:55 - 16:35 4203 ว.4',155,73,3,'ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','1',2569,1,'2026-10-10 14:07:16.828','2026-10-10 14:07:16.828'),(46,'520213','โครงสร้างข้อมูลพื้นฐานและการประยุกต์\n(บ.สนเทศปี2ขึ้นไป)','FUNDAMENTAL OF DATA STRUCTURES AND APPLICATIONS','','3 (2-2-5)',2,0,'Tu 08:30 - 10:15 com ว.3\nTu 10:20 - 12:05 1241 ว.1',60,60,3,'ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','1',2569,1,'2026-10-10 14:07:16.837','2026-10-10 14:07:16.837'),(47,'520214','ดิจิทัลแพลตฟอร์มและโครงสร้างพื้นฐาน\n(บ.สนเทศปี2-5)','DIGITAL PLATFORM AND INFRASTRUCTURE','','3 (2-2-5)',1,0,'Tu 08:30 - 10:15 1239 ว.1\nTu 10:20 - 12:05 1227/1,1227/2 ว.1',100,64,4,'ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์\nผู้ช่วยศาสตราจารย์ ดร.คทา  ประดิษฐวงศ์','1',2569,1,'2026-10-10 14:07:16.845','2026-10-10 14:07:16.845'),(48,'520215','พื้นฐานการเรียนรู้ของเครื่องเชิงสถิติ\n(บ.คอมปี6-8)','FUNDAMENTALS OF STATISTICAL MACHINE LEARNING','','3 (2-2-5)',1,0,'Th 10:20 - 12:05 1239 ว.1\nTh 14:50 - 16:35 1227/1,1227/2 ว.1',20,6,6,'ผู้ช่วยศาสตราจารย์ ดร.สุนีย์  พงษ์พินิจภิญโญ\nนายบูชาภัทร  ป้านศรี','1',2569,1,'2026-10-10 14:07:16.853','2026-10-10 14:07:16.853'),(49,'520231','การวิเคราะห์ข้อมูล\n(บ.คอมปี2-5)','DATA ANALYTICS','','3 (2-2-5)',1,0,'Th 10:20 - 12:05 1239 ว.1\nTh 14:50 - 16:35 1227/1,1227/2 ว.1',87,87,6,'ผู้ช่วยศาสตราจารย์ ดร.สุนีย์  พงษ์พินิจภิญโญ\nนายบูชาภัทร  ป้านศรี','1',2569,1,'2026-10-10 14:07:16.860','2026-10-10 14:07:16.860'),(50,'520321','การบริหารจัดการระบบฐานข้อมูล','DATABASE SYSTEM ADMINISTRATION','','3 (2-2-5)',1,0,'Fr 13:00 - 14:45 ไววิทย์พุทธารี\nFr 14:50 - 16:35 1227/1,1227/2 ว.1',133,111,8,'ผู้ช่วยศาสตราจารย์ ดร.อรวรรณ  เชาวลิต','1',2569,1,'2026-10-10 14:07:16.869','2026-10-10 14:07:16.869'),(51,'520331','ปัญญาประดิษฐ์สำหรับเทคโนโลยีสารสนเทศ','ARTIFICIAL INTELLIGENCE FOR INFORMATION TECHNOLOGY','','3 (2-2-5)',1,0,'Th 13:00 - 14:45 410A-410B\nTh 14:50 - 16:35 410A-410B',94,87,4,'ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์','1',2569,1,'2026-10-10 14:07:16.875','2026-10-10 14:07:16.875'),(52,'520333','การทำเหมืองข้อมูล\n(ล.คอม สนเทศปี3-5)','DATA MINING','','3 (2-2-5)',1,0,'We 08:30 - 12:05 1334 ว.1',40,5,9,'ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','1',2569,1,'2026-10-10 14:07:16.882','2026-10-10 14:07:16.882'),(53,'520335','วิทยาการข้อมูลและเครื่องมือ\n(ล.สนเทศปี3 *ปิด*)','DATA SCIENCE AND TOOLS','','3 (2-2-5)',1,0,'We 13:00 - 14:45 410A-410B\nWe 14:50 - 16:35 410A-410B',0,0,4,'ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์','1',2569,1,'2026-10-10 14:07:16.890','2026-10-10 14:07:16.890'),(54,'520341','การเขียนโปรแกรมแบบเว็บฝั่งไคลเอนต์\n(บ.สนเทศปี3-5)','CLIENT SIDE WEB PROGRAMMING','','3 (2-2-5)',1,0,'Th 08:30 - 10:15 410A-410B\nTh 10:20 - 12:05 410A-410B',104,103,10,'ผู้ช่วยศาสตราจารย์ ดร.สัจจาภรณ์  ไวจรรยา','1',2569,1,'2026-10-10 14:07:16.899','2026-10-10 14:07:16.899'),(55,'520341','เทคโนโลยีและการเขียนโปรแกรมบนเครือข่ายอินเทอร์เน็ตและเวิลด์ไวด์เว็บ\n(บ.สนเทศ ล.คอม ปี6-8)','INTERNET AND WORLD WIDE WEB TECHNOLOGY AND PROGRAMMING','','3 (2-2-5)',1,1,'Mo 13:00 - 14:45 1239 ว.1\nMo 14:50 - 16:35 1227/2 ว.1',9999,19,11,'อาจารย์เสฐลัทธ์  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:16.906','2026-10-10 14:07:16.906'),(56,'520342','การเขียนโปรแกรมแบบเว็บฝั่งเซิร์ฟเวอร์\n(บ.สนเทศปี3-5)','SERVER SIDE WEB PROGRAMMING','','3 (2-2-5)',1,0,'We 08:30 - 10:15 410A-410B\nWe 10:20 - 12:05 410A-410B',104,103,10,'ผู้ช่วยศาสตราจารย์ ดร.สัจจาภรณ์  ไวจรรยา\nผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์','1',2569,1,'2026-10-10 14:07:16.913','2026-10-10 14:07:16.913'),(57,'520342','สถาปัตยกรรมและเทคโนโลยีเครือข่ายคอมพิวเตอร์\n(บ.สนเทศปี6-8)','COMPUTER NETWORK ARCHITECTURE AND TECHNOLOGY','','3 (2-2-5)',1,1,'Th 08:30 - 10:15 1227/2 ว.1\nTh 10:20 - 12:05 1227/2 ว.1',9999,16,11,'อาจารย์เสฐลัทธ์  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:16.921','2026-10-10 14:07:16.921'),(58,'520346','การพัฒนาโปรแกรมประยุกต์บนอุปกรณ์เคลื่อนที่สำหรับธุรกิจ\n(บ.สนเทศปี3-4)','MOBILE APPLICATION DEVELOPMENT FOR BUSINESS','','3 (2-2-5)',1,0,'Sa 08:30 - 10:15 1227/1,1227/2 ว.1\nSa 10:20 - 12:05 1227/1,1227/2 ว.1',80,46,8,'ผู้ช่วยศาสตราจารย์ ดร.อรวรรณ  เชาวลิต','1',2569,1,'2026-10-10 14:07:16.928','2026-10-10 14:07:16.928'),(59,'520354','ระบบปฏิบัติการหุ่นยนต์และการควบคุม\n(ล.สารสนเทศ ปี 3-5)','ROBOT OPERATING SYSTEM AND CONTROL','','3 (2-2-5)',1,0,'We 08:30 - 12:05 1639 ว.1',10,0,3,'ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','1',2569,1,'2026-10-10 14:07:16.934','2026-10-10 14:07:16.934'),(60,'520393','การเตรียมโครงงานวิจัย\n(บ.คอมปี3ขึ้นไป)','RESEARCH PROJECT PREPARATION','','1 (0-2-1)',1,0,'Mo 12:10 - 12:55 1639 ว.1',20,4,14,'ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น\nผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์อภิเษก  หงษ์วิทยากร\nผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์\nอาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต\nอาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:16.942','2026-10-10 14:07:16.942'),(61,'520393','การเตรียมโครงงานวิจัย\n(บ.คอมปี3ขึ้นไป)','RESEARCH PROJECT PREPARATION','','1 (0-2-1)',1,1,'Tu 12:10 - 12:55 1639 ว.1',20,4,14,'ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น\nผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์\nอาจารย์อภิเษก  หงษ์วิทยากร\nผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์\nอาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต\nอาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:17.187','2026-10-10 14:07:17.187'),(62,'520484','เรื่องคัดเฉพาะทางเทคโนโลยีสารสนเทศ 4\n(บ.สนเทศปี3ขึ้นไป)','SELECTED TOPICS IN INFORMATION TECHNOLOGY IV','','3 (2-2-5)',1,0,'Mo 14:50 - 16:35 1240 ว.1',10,0,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','1',2569,1,'2026-10-10 14:07:17.325','2026-10-10 14:07:17.325'),(63,'520484','เรื่องคัดเฉพาะทางเทคโนโลยีสารสนเทศ 4\n(บ.สนเทศปี3ขึ้นไป)','SELECTED TOPICS IN INFORMATION TECHNOLOGY IV','','3 (2-2-5)',1,1,'We 16:40 - 18:25 1227/2 ว.1',10,0,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','1',2569,1,'2026-10-10 14:07:17.333','2026-10-10 14:07:17.333'),(64,'520486','เรื่องคัดเฉพาะทางเทคโนโลยีสารสนเทศ 6\n(ล.สารสนเทศปี4ขึ้นไป)','SELECTED TOPICS IN INFORMATION TECHNOLOGY VI','','3 (2-2-5)',1,0,'Tu 13:00 - 15:40 1639 ว.1',30,3,13,'รองศาสตราจารย์ ดร.ปานใจ  ธารทัศนวงศ์','1',2569,1,'2026-10-10 14:07:17.342','2026-10-10 14:07:17.342'),(65,'520487','เรื่องคัดเฉพาะทางเทคโนโลยีสารสนเทศ 7\n(ล.สนเทศปี6-8)','SELECTED TOPICS IN INFORMATION TECHNOLOGY VII','','3 (2-2-5)',1,0,'Tu 13:00 - 15:40 1639 ว.1',30,9,13,'รองศาสตราจารย์ ดร.ปานใจ  ธารทัศนวงศ์','1',2569,1,'2026-10-10 14:07:17.349','2026-10-10 14:07:17.349'),(66,'520493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',1,0,'Tu 16:40 - 18:25 1639 ว.1',60,6,16,'อาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:17.356','2026-10-10 14:07:17.356'),(67,'520493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',2,0,'Mo 12:10 - 13:50 1639 ว.1',90,3,2,'อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','1',2569,1,'2026-10-10 14:07:17.363','2026-10-10 14:07:17.363'),(68,'520493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',3,0,'Mo 12:10 - 13:50 1639 ว.1',90,1,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','1',2569,1,'2026-10-10 14:07:17.372','2026-10-10 14:07:17.372'),(69,'520493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',4,0,'Mo 12:10 - 13:50 1639 ว.1',90,9,14,'ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','1',2569,1,'2026-10-10 14:07:17.380','2026-10-10 14:07:17.380'),(70,'520493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',5,0,'Su 06:30 - 08:30 1639 ว.1',90,12,12,'อาจารย์อภิเษก  หงษ์วิทยากร','1',2569,1,'2026-10-10 14:07:17.387','2026-10-10 14:07:17.387'),(71,'520493','โครงงานวิจัย 1','RESEARCH PROJECT I','','1 (0-2-1)',6,0,'Mo 12:10 - 13:50 1639 ว.1',90,4,9,'ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','1',2569,1,'2026-10-10 14:07:17.395','2026-10-10 14:07:17.395'),(72,'520493','โครงงานวิจัย 1\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT I','','1 (0-2-1)',1,1,'Mo 12:10 - 13:50 1639 ว.1',30,0,16,'อาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:17.403','2026-10-10 14:07:17.403'),(73,'520494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',1,0,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,3,16,'อาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:17.410','2026-10-10 14:07:17.529'),(74,'520494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',2,0,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,3,2,'อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','1',2569,1,'2026-10-10 14:07:17.417','2026-10-10 14:07:17.417'),(75,'520494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',3,0,'Su 08:30 - 12:05 1639 ว.1',9999,14,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','1',2569,1,'2026-10-10 14:07:17.425','2026-10-10 14:07:17.425'),(76,'520494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',4,0,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1\nMo 07:40 - 09:20 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,0,14,'ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','1',2569,1,'2026-10-10 14:07:17.435','2026-10-10 14:07:17.540'),(77,'520494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',5,0,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,6,12,'อาจารย์อภิเษก  หงษ์วิทยากร','1',2569,1,'2026-10-10 14:07:17.444','2026-10-10 14:07:17.444'),(78,'520494','โครงงานวิจัย 2','RESEARCH PROJECT II','','2 (0-4-2)',6,0,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,9,9,'ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','1',2569,1,'2026-10-10 14:07:17.451','2026-10-10 14:07:17.451'),(80,'520494','โครงงานวิจัย 2\n(บ.สนเทศปี6-8 ตามรายชื่อ)','RESEARCH PROJECT II','','2 (0-4-2)',1,1,'Tu 16:40 - 18:25 1639 ว.1',9999,8,16,'อาจารย์ ดร.วัสรา  รอดเหตุภัย','1',2569,1,'2026-10-10 14:07:17.466','2026-10-10 14:07:17.530'),(82,'520494','โครงงานวิจัย 2\n(บ.สนเทศปีตกค้าง ตามรายชื่อ)','RESEARCH PROJECT II','','2 (0-4-2)',3,1,'Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1',9999,0,15,'ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','1',2569,1,'2026-10-10 14:07:17.482','2026-10-10 14:07:17.482'),(83,'517122','ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 2','COMPUTER PROGRAMMING SKILL 2','','',1,0,'อ,พฤ 13:00-16:00',0,0,18,'','1',2569,0,'2026-10-10 14:16:32.694','2026-10-10 14:16:32.694');
/*!40000 ALTER TABLE `courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `form_reviews`
--

DROP TABLE IF EXISTS `form_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_reviews` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `posting_id` bigint unsigned NOT NULL DEFAULT '0',
  `course_id` bigint unsigned NOT NULL,
  `reviewer_id` bigint unsigned NOT NULL,
  `status` enum('pending','verified','returned') NOT NULL DEFAULT 'pending',
  `note` text,
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_form_reviews_posting_unique` (`posting_id`),
  KEY `idx_form_reviews_posting_id` (`posting_id`),
  KEY `idx_form_reviews_course_lookup` (`course_id`),
  KEY `fk_form_reviews_reviewer_id` (`reviewer_id`),
  CONSTRAINT `fk_form_reviews_course_id` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_form_reviews_posting_id` FOREIGN KEY (`posting_id`) REFERENCES `postings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_form_reviews_reviewer_id` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `form_reviews`
--

LOCK TABLES `form_reviews` WRITE;
/*!40000 ALTER TABLE `form_reviews` DISABLE KEYS */;
/*!40000 ALTER TABLE `form_reviews` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`labassist`@`%`*/ /*!50003 TRIGGER `trg_form_reviews_posting_course_bi` BEFORE INSERT ON `form_reviews` FOR EACH ROW BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'form_reviews.course_id must match postings.course_id';
    END IF;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`labassist`@`%`*/ /*!50003 TRIGGER `trg_form_reviews_posting_course_bu` BEFORE UPDATE ON `form_reviews` FOR EACH ROW BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'form_reviews.course_id must match postings.course_id';
    END IF;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `monthly_periods`
--

DROP TABLE IF EXISTS `monthly_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monthly_periods` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `staff_case_id` bigint unsigned NOT NULL,
  `month` bigint NOT NULL,
  `year` bigint NOT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `closed_at` datetime(3) DEFAULT NULL,
  `closed_by_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_monthly_period_case_month` (`staff_case_id`,`month`,`year`),
  KEY `idx_monthly_periods_staff_case_id` (`staff_case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `monthly_periods`
--

LOCK TABLES `monthly_periods` WRITE;
/*!40000 ALTER TABLE `monthly_periods` DISABLE KEYS */;
/*!40000 ALTER TABLE `monthly_periods` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `course_id` bigint unsigned DEFAULT NULL,
  `title` varchar(300) NOT NULL,
  `body` text NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_notifications_user_id` (`user_id`),
  KEY `fk_notifications_course_id` (`course_id`),
  CONSTRAINT `fk_notifications_course_id` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notifications_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `postings`
--

DROP TABLE IF EXISTS `postings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `postings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `course_id` bigint unsigned NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `lab_boy_slots` bigint DEFAULT '0',
  `lab_boy_accepted` bigint DEFAULT '0',
  `status` enum('open','closing_soon','closed','draft','archived') DEFAULT 'draft',
  `deadline` datetime(3) DEFAULT NULL,
  `description` text,
  `requirements` text,
  `require_grade_proof` tinyint(1) DEFAULT '0',
  `closed_by_instructor` tinyint(1) DEFAULT '0',
  `lab_boy_schedule_confirmed` tinyint(1) DEFAULT '0',
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_postings_active_course` (((case when (`is_active` = 1) then `course_id` else NULL end))),
  KEY `idx_postings_course_id` (`course_id`),
  KEY `idx_postings_is_active` (`is_active`),
  CONSTRAINT `fk_postings_course_id` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=84 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `postings`
--

LOCK TABLES `postings` WRITE;
/*!40000 ALTER TABLE `postings` DISABLE KEYS */;
INSERT INTO `postings` VALUES (1,1,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.496','2026-10-10 14:07:16.496'),(2,2,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.504','2026-10-10 14:07:16.504'),(3,3,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.515','2026-10-10 14:07:16.515'),(4,4,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.524','2026-10-10 14:07:16.524'),(5,5,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.534','2026-10-10 14:07:16.534'),(6,6,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.542','2026-10-10 14:07:16.542'),(7,7,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.551','2026-10-10 14:07:16.551'),(8,8,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.559','2026-10-10 14:07:16.559'),(9,9,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.567','2026-10-10 14:07:16.567'),(10,10,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.575','2026-10-10 14:07:16.575'),(11,11,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.584','2026-10-10 14:07:16.584'),(12,12,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.592','2026-10-10 14:07:16.592'),(13,13,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.600','2026-10-10 14:07:16.600'),(14,14,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.607','2026-10-10 14:07:16.607'),(15,15,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.614','2026-10-10 14:07:16.614'),(16,16,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.621','2026-10-10 14:07:16.621'),(17,17,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.628','2026-10-10 14:07:16.628'),(18,18,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.634','2026-10-10 14:07:16.634'),(19,19,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.641','2026-10-10 14:07:16.641'),(20,20,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.648','2026-10-10 14:07:16.648'),(21,21,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.655','2026-10-10 14:07:16.655'),(22,22,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.665','2026-10-10 14:07:16.665'),(23,23,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.672','2026-10-10 14:07:16.672'),(24,24,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.679','2026-10-10 14:07:16.679'),(25,25,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.687','2026-10-10 14:07:16.687'),(26,26,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.695','2026-10-10 14:07:16.695'),(27,27,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.701','2026-10-10 14:07:16.701'),(28,28,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.708','2026-10-10 14:07:16.708'),(29,29,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.715','2026-10-10 14:07:16.715'),(30,30,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.723','2026-10-10 14:07:16.723'),(31,31,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.729','2026-10-10 14:07:16.729'),(32,32,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.737','2026-10-10 14:07:16.737'),(33,33,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.743','2026-10-10 14:07:16.743'),(34,34,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.751','2026-10-10 14:07:16.751'),(35,35,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.760','2026-10-10 14:07:16.760'),(36,36,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.767','2026-10-10 14:07:16.767'),(37,37,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.774','2026-10-10 14:07:16.774'),(38,38,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.782','2026-10-10 14:07:16.782'),(40,40,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.797','2026-10-10 14:07:16.797'),(41,41,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.805','2026-10-10 14:07:16.805'),(42,42,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.812','2026-10-10 14:07:16.812'),(43,43,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.818','2026-10-10 14:07:16.818'),(44,44,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.824','2026-10-10 14:07:16.824'),(45,45,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.830','2026-10-10 14:07:16.830'),(46,46,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.839','2026-10-10 14:07:16.839'),(47,47,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.847','2026-10-10 14:07:16.847'),(48,48,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.854','2026-10-10 14:07:16.854'),(49,49,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.862','2026-10-10 14:07:16.862'),(50,50,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.870','2026-10-10 14:07:16.870'),(51,51,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.877','2026-10-10 14:07:16.877'),(52,52,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.884','2026-10-10 14:07:16.884'),(53,53,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.894','2026-10-10 14:07:16.894'),(54,54,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.901','2026-10-10 14:07:16.901'),(55,55,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.908','2026-10-10 14:07:16.908'),(56,56,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.915','2026-10-10 14:07:16.915'),(57,57,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.923','2026-10-10 14:07:16.923'),(58,58,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.929','2026-10-10 14:07:16.929'),(59,59,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.936','2026-10-10 14:07:16.936'),(60,60,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:16.945','2026-10-10 14:07:16.945'),(61,61,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.189','2026-10-10 14:07:17.189'),(62,62,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.327','2026-10-10 14:07:17.327'),(63,63,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.335','2026-10-10 14:07:17.335'),(64,64,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.344','2026-10-10 14:07:17.344'),(65,65,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.351','2026-10-10 14:07:17.351'),(66,66,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.358','2026-10-10 14:07:17.358'),(67,67,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.365','2026-10-10 14:07:17.365'),(68,68,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.374','2026-10-10 14:07:17.374'),(69,69,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.382','2026-10-10 14:07:17.382'),(70,70,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.389','2026-10-10 14:07:17.389'),(71,71,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.397','2026-10-10 14:07:17.397'),(72,72,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.405','2026-10-10 14:07:17.405'),(73,73,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.412','2026-10-10 14:07:17.412'),(74,74,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.419','2026-10-10 14:07:17.419'),(75,75,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.427','2026-10-10 14:07:17.427'),(76,76,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.436','2026-10-10 14:07:17.436'),(77,77,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.446','2026-10-10 14:07:17.446'),(78,78,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.453','2026-10-10 14:07:17.453'),(80,80,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.468','2026-10-10 14:07:17.468'),(82,82,1,0,0,'draft',NULL,NULL,NULL,0,0,0,'2026-10-10 14:07:17.484','2026-10-10 14:07:17.484'),(83,83,1,6,0,'open','2026-10-31 14:16:32.694',NULL,NULL,0,0,0,'2026-10-10 14:16:32.696','2026-10-10 14:16:32.696');
/*!40000 ALTER TABLE `postings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schedule_group_assignments`
--

DROP TABLE IF EXISTS `schedule_group_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schedule_group_assignments` (
  `schedule_group_id` bigint unsigned NOT NULL,
  `student_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`schedule_group_id`,`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedule_group_assignments`
--

LOCK TABLES `schedule_group_assignments` WRITE;
/*!40000 ALTER TABLE `schedule_group_assignments` DISABLE KEYS */;
/*!40000 ALTER TABLE `schedule_group_assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schedule_group_months`
--

DROP TABLE IF EXISTS `schedule_group_months`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schedule_group_months` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `schedule_group_id` bigint unsigned NOT NULL,
  `year` bigint NOT NULL,
  `month` bigint NOT NULL,
  `month_start_date` date DEFAULT NULL,
  `month_end_date` date DEFAULT NULL,
  `is_manual` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_sgm_group_ym` (`schedule_group_id`,`year`,`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedule_group_months`
--

LOCK TABLES `schedule_group_months` WRITE;
/*!40000 ALTER TABLE `schedule_group_months` DISABLE KEYS */;
/*!40000 ALTER TABLE `schedule_group_months` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff_audit_logs`
--

DROP TABLE IF EXISTS `staff_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff_audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `staff_case_id` bigint unsigned DEFAULT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` bigint unsigned NOT NULL,
  `action` varchar(100) NOT NULL,
  `actor_id` bigint unsigned NOT NULL,
  `actor_name` varchar(200) DEFAULT NULL,
  `old_value` text,
  `new_value` text,
  `reason` varchar(500) DEFAULT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_staff_audit_logs_staff_case_id` (`staff_case_id`),
  KEY `idx_staff_audit_logs_entity_type` (`entity_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff_audit_logs`
--

LOCK TABLES `staff_audit_logs` WRITE;
/*!40000 ALTER TABLE `staff_audit_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `staff_audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff_case_schedule_groups`
--

DROP TABLE IF EXISTS `staff_case_schedule_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff_case_schedule_groups` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `staff_case_id` bigint unsigned NOT NULL,
  `group_name` varchar(100) DEFAULT NULL,
  `week_day` varchar(20) NOT NULL,
  `start_time` varchar(10) NOT NULL,
  `end_time` varchar(10) NOT NULL,
  `hours_per_session` decimal(8,2) DEFAULT '0.00',
  `rate_per_hour_satang` bigint NOT NULL DEFAULT '0',
  `work_start_date` datetime(3) DEFAULT NULL,
  `work_end_date` datetime(3) DEFAULT NULL,
  `note` varchar(500) DEFAULT NULL,
  `week_days_json` text,
  `locked_at` datetime(3) DEFAULT NULL,
  `locked_by_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_staff_case_schedule_groups_staff_case_id` (`staff_case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff_case_schedule_groups`
--

LOCK TABLES `staff_case_schedule_groups` WRITE;
/*!40000 ALTER TABLE `staff_case_schedule_groups` DISABLE KEYS */;
/*!40000 ALTER TABLE `staff_case_schedule_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff_cases`
--

DROP TABLE IF EXISTS `staff_cases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff_cases` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `posting_id` bigint unsigned NOT NULL,
  `course_id` bigint unsigned NOT NULL,
  `semester` varchar(10) NOT NULL,
  `academic_year` bigint NOT NULL,
  `status` enum('open','plan_locked','done') NOT NULL DEFAULT 'open',
  `lab_boy_count` bigint DEFAULT '0',
  `hours_per_session` decimal(8,2) DEFAULT '0.00',
  `rate_per_hour` bigint NOT NULL DEFAULT '5000',
  `work_start_date` datetime(3) DEFAULT NULL,
  `work_end_date` datetime(3) DEFAULT NULL,
  `confirmed_by_instructor_at` datetime(3) DEFAULT NULL,
  `confirmed_by_instructor_id` bigint unsigned DEFAULT NULL,
  `plan_locked_at` datetime(3) DEFAULT NULL,
  `plan_locked_by_id` bigint unsigned DEFAULT NULL,
  `created_by_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_staff_cases_posting_id` (`posting_id`),
  KEY `idx_staff_cases_course_id` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff_cases`
--

LOCK TABLES `staff_cases` WRITE;
/*!40000 ALTER TABLE `staff_cases` DISABLE KEYS */;
/*!40000 ALTER TABLE `staff_cases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff_documents`
--

DROP TABLE IF EXISTS `staff_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff_documents` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` longtext NOT NULL,
  `type` enum('hiring_notice','approval_memo','lab_notice','payment_evidence','payment_request','work_report') NOT NULL,
  `course_ref` varchar(255) DEFAULT NULL,
  `posting_id` bigint unsigned DEFAULT NULL,
  `course_id` bigint unsigned DEFAULT NULL,
  `staff_id` bigint unsigned NOT NULL,
  `status` enum('draft','pending','approved','generated','awaiting_signature','signed','cancelled','superseded') NOT NULL DEFAULT 'draft',
  `note` text,
  `period` longtext,
  `session_dates` longtext,
  `hours_per_session` decimal(8,2) DEFAULT '0.00',
  `rate` decimal(10,2) DEFAULT '0.00',
  `roster` longtext,
  `total_amount` decimal(12,2) DEFAULT '0.00',
  `work_day` longtext,
  `work_time_start` longtext,
  `work_time_end` longtext,
  `work_schedule` longtext,
  `sessions_per_month` bigint DEFAULT NULL,
  `ref_number` longtext,
  `prior_memo_ref` longtext,
  `prior_memo_date` longtext,
  `dept_head_name` longtext,
  `dean_name` longtext,
  `staff_officer_name` longtext,
  `staff_case_id` bigint unsigned DEFAULT NULL,
  `monthly_period_id` bigint unsigned DEFAULT NULL,
  `version` bigint NOT NULL DEFAULT '1',
  `superseded_by_id` bigint unsigned DEFAULT NULL,
  `signed_file_name` longtext,
  `signed_file_data` longblob,
  `signed_at` datetime(3) DEFAULT NULL,
  `signed_by_id` bigint unsigned DEFAULT NULL,
  `data_snapshot` longtext,
  `snapshot_version` bigint DEFAULT '1',
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_staff_documents_posting_id` (`posting_id`),
  KEY `idx_staff_documents_staff_case_id` (`staff_case_id`),
  KEY `idx_staff_documents_monthly_period_id` (`monthly_period_id`),
  KEY `idx_staff_documents_superseded_by_id` (`superseded_by_id`),
  KEY `fk_staff_documents_staff_id` (`staff_id`),
  KEY `fk_staff_documents_course_id` (`course_id`),
  CONSTRAINT `fk_staff_documents_course_id` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_staff_documents_posting_id` FOREIGN KEY (`posting_id`) REFERENCES `postings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_staff_documents_staff_id` FOREIGN KEY (`staff_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff_documents`
--

LOCK TABLES `staff_documents` WRITE;
/*!40000 ALTER TABLE `staff_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `staff_documents` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`labassist`@`%`*/ /*!50003 TRIGGER `trg_staff_documents_posting_course_bi` BEFORE INSERT ON `staff_documents` FOR EACH ROW BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id IS NOT NULL AND NEW.course_id IS NOT NULL THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'staff_documents.course_id must match postings.course_id';
    END IF;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`labassist`@`%`*/ /*!50003 TRIGGER `trg_staff_documents_posting_course_bu` BEFORE UPDATE ON `staff_documents` FOR EACH ROW BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id IS NOT NULL AND NEW.course_id IS NOT NULL THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'staff_documents.course_id must match postings.course_id';
    END IF;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `student_info_documents`
--

DROP TABLE IF EXISTS `student_info_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_info_documents` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_data` longblob,
  `ocr_student_id` varchar(30) DEFAULT NULL,
  `ocr_full_name_th` varchar(300) DEFAULT NULL,
  `ocr_full_name_en` varchar(300) DEFAULT NULL,
  `ocr_education_level` varchar(100) DEFAULT NULL,
  `ocr_curriculum` varchar(300) DEFAULT NULL,
  `ocr_faculty` varchar(300) DEFAULT NULL,
  `ocr_campus` varchar(200) DEFAULT NULL,
  `ocr_student_status` varchar(100) DEFAULT NULL,
  `confidence` decimal(5,4) DEFAULT NULL,
  `confirmed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_student_info_documents_user_id` (`user_id`),
  CONSTRAINT `fk_student_info_documents_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_info_documents`
--

LOCK TABLES `student_info_documents` WRITE;
/*!40000 ALTER TABLE `student_info_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_info_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `term_schedules`
--

DROP TABLE IF EXISTS `term_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `term_schedules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `semester` varchar(10) NOT NULL,
  `academic_year` bigint NOT NULL,
  `slots` longtext,
  `status` varchar(20) NOT NULL DEFAULT 'unset',
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_user_term` (`user_id`,`semester`,`academic_year`),
  CONSTRAINT `fk_term_schedules_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `term_schedules`
--

LOCK TABLES `term_schedules` WRITE;
/*!40000 ALTER TABLE `term_schedules` DISABLE KEYS */;
/*!40000 ALTER TABLE `term_schedules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transcripts`
--

DROP TABLE IF EXISTS `transcripts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transcripts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_data` longblob NOT NULL,
  `file_size` bigint NOT NULL,
  `uploaded_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_transcripts_user_id` (`user_id`),
  CONSTRAINT `fk_transcripts_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transcripts`
--

LOCK TABLES `transcripts` WRITE;
/*!40000 ALTER TABLE `transcripts` DISABLE KEYS */;
/*!40000 ALTER TABLE `transcripts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(100) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `full_name` varchar(200) NOT NULL,
  `full_name_en` varchar(200) NOT NULL DEFAULT '',
  `avatar_url` mediumtext,
  `email` varchar(200) NOT NULL,
  `role` enum('student','instructor','staff','admin') NOT NULL,
  `student_id` varchar(20) DEFAULT NULL,
  `google_sub` varchar(100) DEFAULT NULL,
  `gpa` decimal(3,2) DEFAULT NULL,
  `faculty` varchar(200) DEFAULT NULL,
  `year` tinyint DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `transcript_grades` json DEFAULT NULL,
  `transcript_status` varchar(50) DEFAULT NULL,
  `transcript_message` text,
  `transcript_confidence` decimal(5,4) DEFAULT NULL,
  `transcript_updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_users_username` (`username`),
  UNIQUE KEY `idx_users_student_id` (`student_id`),
  UNIQUE KEY `idx_users_google_sub` (`google_sub`),
  UNIQUE KEY `idx_users_email_unique` ((nullif(`email`,_utf8mb4'')))
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'kanraya','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์ ดร.กรัญญา  สิทธิสงวน','Karanya Sitdhisanguan','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.349','2026-10-10 14:07:16.349',NULL,NULL,NULL,NULL,NULL),(2,'saowaluck','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต','Saowalak Arampongsanuwat','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.353','2026-10-10 14:07:16.353',NULL,NULL,NULL,NULL,NULL),(3,'kritsana','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน','Kristsana Seepanomwan','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.357','2026-10-10 14:07:16.357',NULL,NULL,NULL,NULL,NULL),(4,'natchote','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์','Nuttachot Promrit','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.361','2026-10-10 14:07:16.361',NULL,NULL,NULL,NULL,NULL),(5,'katha','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์ ดร.คทา  ประดิษฐวงศ์','Kata Praditwong','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.365','2026-10-10 14:07:16.365',NULL,NULL,NULL,NULL,NULL),(6,'sunee','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์ ดร.สุนีย์  พงษ์พินิจภิญโญ','Sunee Pongpinigpinyo','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.369','2026-10-10 14:07:16.369',NULL,NULL,NULL,NULL,NULL),(7,'buchapat','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','นายบูชาภัทร  ป้านศรี','Buchaputara Pansri','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.373','2026-10-10 14:07:16.373',NULL,NULL,NULL,NULL,NULL),(8,'orawan','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์ ดร.อรวรรณ  เชาวลิต','Orawan Chaowalit','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.377','2026-10-10 14:07:16.377',NULL,NULL,NULL,NULL,NULL),(9,'opas','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์','Opas Wongtaweesap','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.381','2026-10-10 14:07:16.381',NULL,NULL,NULL,NULL,NULL),(10,'sajjaporn','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์ ดร.สัจจาภรณ์  ไวจรรยา','Sajjaporn Waijanya','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.389','2026-10-10 14:07:16.389',NULL,NULL,NULL,NULL,NULL),(11,'setthalath','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','อาจารย์เสฐลัทธ์  รอดเหตุภัย','Sethalat Rodhetbhai','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.395','2026-10-10 14:07:16.395',NULL,NULL,NULL,NULL,NULL),(12,'aphisek','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','อาจารย์อภิเษก  หงษ์วิทยากร','Apisake Hongwitayakorn','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.399','2026-10-10 14:07:16.399',NULL,NULL,NULL,NULL,NULL),(13,'panjai','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','รองศาสตราจารย์ ดร.ปานใจ  ธารทัศนวงศ์','Panjai Tantatsanawong','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.403','2026-10-10 14:07:16.403',NULL,NULL,NULL,NULL,NULL),(14,'weenawadee','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น','Weenawadee Muangon','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.407','2026-10-10 14:07:16.407',NULL,NULL,NULL,NULL,NULL),(15,'panyanat','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์','Panyanat Aonpong','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.410','2026-10-10 14:07:16.410',NULL,NULL,NULL,NULL,NULL),(16,'watsara','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','อาจารย์ ดร.วัสรา  รอดเหตุภัย','Wasara Rodhetbhai','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.415','2026-10-10 14:07:16.415',NULL,NULL,NULL,NULL,NULL),(17,'ratchadaporn','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ช่วยศาสตราจารย์ ดร.รัชดาพร  คณาวงษ์','Ratchadaporn Kanawong','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.418','2026-10-10 14:07:16.418',NULL,NULL,NULL,NULL,NULL),(18,'puriwat','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','อาจารย์ ดร.ภูริวัจน์  วรวิชัยพัฒน์','Phuriwat Worrawichaipat','','','instructor',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:16.421','2026-10-10 14:07:16.421',NULL,NULL,NULL,NULL,NULL),(19,'admin','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ผู้ดูแลระบบ','','','admin@cp.su.ac.th','admin',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:07:17.545','2026-10-10 14:07:17.545',NULL,NULL,NULL,NULL,NULL),(20,'parinya','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ปริญญา สุภาวดี','','','parinya@cp.su.ac.th','staff',NULL,NULL,NULL,NULL,NULL,1,'2026-10-10 14:16:32.686','2026-10-10 14:16:32.690',NULL,NULL,NULL,NULL,NULL),(21,'demo_std01','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ธนภัทร ศรีวิไล','','','demo_std01@example.com','student','6410123456',NULL,3.85,'เทคโนโลยีสารสนเทศ',3,1,'2026-10-10 14:16:32.705','2026-10-10 14:16:32.709',NULL,NULL,NULL,NULL,NULL),(22,'demo_std02','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ปวีณ์นุช อินทรสุวรรณ','','','demo_std02@example.com','student','6410123457',NULL,3.42,'วิทยาการคอมพิวเตอร์',3,1,'2026-10-10 14:16:32.723','2026-10-10 14:16:32.729',NULL,NULL,NULL,NULL,NULL),(23,'demo_std03','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','กิตติภูมิ ทองสุข','','','demo_std03@example.com','student','6410123458',NULL,3.15,'วิทยาการคอมพิวเตอร์',2,1,'2026-10-10 14:16:32.769','2026-10-10 14:16:32.787',NULL,NULL,NULL,NULL,NULL),(24,'demo_std04','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ศศิวิมล บุญมาก','','','demo_std04@example.com','student','6410123459',NULL,3.67,'เทคโนโลยีสารสนเทศ',3,1,'2026-10-10 14:16:32.813','2026-10-10 14:16:32.818',NULL,NULL,NULL,NULL,NULL),(25,'demo_std05','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','อดิศร แก้วมณี','','','demo_std05@example.com','student','6410123460',NULL,2.89,'วิทยาการคอมพิวเตอร์',3,1,'2026-10-10 14:16:32.841','2026-10-10 14:16:32.844',NULL,NULL,NULL,NULL,NULL),(26,'demo_std06','$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO','ณัฐพล ทดสอบระบบ','','','demo_std06@example.com','student','6410123461',NULL,3.50,'วิทยาการคอมพิวเตอร์',3,1,'2026-10-10 14:16:32.863','2026-10-10 14:16:32.868',NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `work_occurrences`
--

DROP TABLE IF EXISTS `work_occurrences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_occurrences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `staff_case_id` bigint unsigned NOT NULL,
  `schedule_group_id` bigint unsigned DEFAULT NULL,
  `scheduled_date` date NOT NULL,
  `start_time` varchar(10) NOT NULL,
  `end_time` varchar(10) NOT NULL,
  `status` enum('scheduled','cancelled_holiday','rescheduled','completed','absent','cancelled_other') NOT NULL DEFAULT 'scheduled',
  `calendar_date_id` bigint unsigned DEFAULT NULL,
  `rescheduled_to_date` date DEFAULT NULL,
  `rescheduled_to_start` varchar(10) DEFAULT NULL,
  `rescheduled_to_end` varchar(10) DEFAULT NULL,
  `rescheduled_from_occurrence_id` bigint unsigned DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `actual_hours` decimal(8,2) DEFAULT '0.00',
  `updated_by_id` bigint unsigned DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_wo_group_date` (`schedule_group_id`,`scheduled_date`),
  KEY `idx_work_occurrences_staff_case_id` (`staff_case_id`),
  KEY `idx_work_occurrences_schedule_group_id` (`schedule_group_id`),
  KEY `idx_work_occurrences_scheduled_date` (`scheduled_date`),
  KEY `idx_work_occurrences_calendar_date_id` (`calendar_date_id`),
  KEY `idx_work_occurrences_rescheduled_from_occurrence_id` (`rescheduled_from_occurrence_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_occurrences`
--

LOCK TABLES `work_occurrences` WRITE;
/*!40000 ALTER TABLE `work_occurrences` DISABLE KEYS */;
/*!40000 ALTER TABLE `work_occurrences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'labassist'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-10 14:35:34
