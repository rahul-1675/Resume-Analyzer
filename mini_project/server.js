const express = require('express');
const XLSX = require('xlsx');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const multer = require('multer');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static('public'));

const EXCEL_FILE = 'ELEVYA_Database.xlsx';
const RESUMES_FOLDER = 'resumes';
const PROFILE_IMAGES_FOLDER = 'profile_images';

// Ensure folders exist
if (!fs.existsSync(RESUMES_FOLDER)) {
    fs.mkdirSync(RESUMES_FOLDER);
}

if (!fs.existsSync(PROFILE_IMAGES_FOLDER)) {
    fs.mkdirSync(PROFILE_IMAGES_FOLDER);
}

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, PROFILE_IMAGES_FOLDER);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Enhanced password validation function
function validatePasswordStrength(password) {
    if (!password) return false;
    
    const requirements = {
        length: password.length >= 8 && password.length <= 20,
        letter: /[a-zA-Z]/.test(password),
        number: /[0-9]/.test(password),
        symbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?~`]/.test(password)
    };
    
    return requirements.length && requirements.letter && requirements.number && requirements.symbol;
}

// Point-wise format validation function
function validatePointWiseFormat(text, fieldName) {
    if (!text || text.trim().length === 0) {
        return { isValid: true, message: '' };
    }
    
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) return { isValid: true, message: '' };
    
    // For single line entries, don't enforce point-wise format
    if (lines.length === 1) return { isValid: true, message: '' };
    
    // Check if at least 50% of non-empty lines start with bullet points or dashes
    const pointWiseLines = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*') || 
               trimmed.startsWith('○') || trimmed.startsWith('►') || /^\d+\./.test(trimmed);
    });
    
    const isValid = pointWiseLines.length >= Math.ceil(lines.length * 0.5);
    
    return {
        isValid,
        message: isValid ? '' : `${fieldName} should use bullet points (•) or dashes (-) for better formatting and ATS compatibility.`
    };
}

// Server-side validation function
function validateRegistrationData(data) {
    const errors = [];
    
    // Required field validation
    if (!data.fullName || data.fullName.trim().length < 2) {
        errors.push('Full name must be at least 2 characters long');
    }
    
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push('Please provide a valid email address');
    }
    
    if (!data.phoneNumber || !/^[0-9]{10}$/.test(data.phoneNumber.replace(/\s|-/g, ''))) {
        errors.push('Please provide a valid 10-digit phone number');
    }
    
    if (!data.gender) {
        errors.push('Please select your gender');
    }
    
    if (!data.dateOfBirth) {
        errors.push('Please provide your date of birth');
    } else {
        const today = new Date();
        const birthDate = new Date(data.dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        
        if (age < 16 || age > 100) {
            errors.push('Age must be between 16 and 100 years');
        }
    }
    
    if (!data.username || !/^[a-zA-Z0-9_]{3,20}$/.test(data.username)) {
        errors.push('Username must be 3-20 characters long and contain only letters, numbers, and underscores');
    }
    
    // Enhanced password validation
    if (!data.password) {
        errors.push('Password is required');
    } else if (!validatePasswordStrength(data.password)) {
        errors.push('Password must be 8-20 characters long and contain at least one letter, one number, and one symbol');
    }
    
    if (data.password !== data.confirmPassword) {
        errors.push('Passwords do not match');
    }
    
    // URL validations
    if (data.linkedinProfile) {
        try {
            new URL(data.linkedinProfile);
            if (!data.linkedinProfile.toLowerCase().includes('linkedin.com')) {
                errors.push('Please provide a valid LinkedIn URL');
            }
        } catch {
            errors.push('Please provide a valid LinkedIn URL');
        }
    }
    
    if (data.portfolioGithub) {
        try {
            new URL(data.portfolioGithub);
        } catch {
            errors.push('Please provide a valid Portfolio/GitHub URL');
        }
    }
    
    // Point-wise format validation warnings
    const pointWiseFields = [
        { field: 'technical_skills', name: 'Technical Skills' },
        { field: 'soft_skills', name: 'Soft Skills' },
        { field: 'workExperience', name: 'Work Experience' },
        { field: 'projects', name: 'Projects' },
        { field: 'certifications', name: 'Certifications' },
        { field: 'achievements', name: 'Achievements' },
        { field: 'additional_qualifications', name: 'Additional Qualifications' },
        { field: 'references', name: 'References' }
    ];
    
    pointWiseFields.forEach(({ field, name }) => {
        if (data[field]) {
            const validation = validatePointWiseFormat(data[field], name);
            if (!validation.isValid) {
                // These are warnings, not hard errors for registration
                console.log(`Format warning for ${name}: ${validation.message}`);
            }
        }
    });
    
    return errors;
}

function readExcelFile() {
    try {
        const workbook = XLSX.readFile(EXCEL_FILE);
        return workbook;
    } catch (error) {
        console.log('Creating new Excel database file...');
        const workbook = XLSX.utils.book_new();
        
        // Enhanced User Registration Schema with profile image
        const userData = [
            [
                // Personal Information
                'User_ID', 'Registration_Date', 'Full_Name', 'Email', 'Phone_Number', 'Gender', 
                'Date_of_Birth', 'Address', 'LinkedIn_Profile', 'Portfolio_GitHub', 'Nationality', 
                'Marital_Status', 'Profile_Image_Path',
                
                // Career Information
                'Career_Objective',
                
                // Education - 10th Standard
                'Tenth_Board', 'Tenth_Year', 'Tenth_Percentage', 'Tenth_School',
                
                // Education - 12th Standard
                'Twelfth_Board', 'Twelfth_Year', 'Twelfth_Percentage', 'Twelfth_School', 'Twelfth_Stream',
                
                // Education - Bachelor's
                'Bachelor_Degree', 'Bachelor_Year', 'Bachelor_CGPA', 'Bachelor_College',
                
                // Education - Master's (Optional)
                'Master_Degree', 'Master_Year', 'Master_CGPA', 'Master_College',
                
                // Additional Education
                'Additional_Qualifications',
                
                // Skills
                'Technical_Skills', 'Soft_Skills',
                
                // Experience & Projects
                'Work_Experience', 'Projects', 'Certifications', 'Achievements',
                
                // Additional Information
                'Languages_Known', 'Hobbies', 'References',
                
                // Account Information
                'Username', 'Password'
            ]
        ];
        
        const worksheet = XLSX.utils.aoa_to_sheet(userData);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'User_Registration');
        XLSX.writeFile(workbook, EXCEL_FILE);
        return workbook;
    }
}

function writeExcelFile(workbook) {
    XLSX.writeFile(workbook, EXCEL_FILE);
}

// Enhanced Resume PDF Generator with Profile Image
// Enhanced Resume PDF Generator with Profile Image and All Fields
class ResumeGenerator {
    constructor(userData) {
        this.userData = userData;
        this.doc = null;
        this.pageHeight = 792;
        this.pageWidth = 612;
        this.margin = 50;
        this.currentY = this.margin;
        this.lineHeight = 14;
        this.smallLineHeight = 10;
    }

    generate() {
        return new Promise((resolve, reject) => {
            try {
                this.doc = new PDFDocument({
                    size: 'A4',
                    margin: this.margin
                });

                const filename = `Resume_${this.userData.fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
                const filepath = path.join(RESUMES_FOLDER, filename);
                
                const writeStream = fs.createWriteStream(filepath);
                this.doc.pipe(writeStream);

                this.addHeader();
                this.addPersonalInfo();
                this.addCareerObjective();
                this.addEducation();
                this.addSkills();
                this.addWorkExperience();
                this.addProjects();
                this.addCertifications();
                this.addAchievements();
                this.addLanguagesAndHobbies();
                this.addReferences();

                this.doc.end();

                writeStream.on('finish', () => {
                    const stats = fs.statSync(filepath);
                    resolve({
                        filename: filename,
                        filepath: filepath,
                        filesize: stats.size
                    });
                });

                writeStream.on('error', reject);

            } catch (error) {
                reject(error);
            }
        });
    }

    addHeader() {
        // Add profile image if available
        if (this.userData.profileImagePath && fs.existsSync(this.userData.profileImagePath)) {
            try {
                // Add image to top right
                this.doc.image(this.userData.profileImagePath, this.pageWidth - this.margin - 80, this.currentY, {
                    width: 80,
                    height: 80,
                    align: 'center'
                });
            } catch (imageError) {
                console.log('Error adding profile image to PDF:', imageError);
            }
        }

        // Name
        this.doc.fontSize(24)
               .font('Helvetica-Bold')
               .fillColor('#2c3e50')
               .text(this.userData.fullName.toUpperCase(), this.margin, this.currentY, {
                   width: this.userData.profileImagePath ? this.pageWidth - this.margin * 2 - 100 : this.pageWidth - this.margin * 2,
                   align: 'left'
               });
        
        this.currentY += 35;

        // Contact Information
        this.doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#34495e');

        const contactInfo = [
            this.userData.email,
            this.userData.phoneNumber,
            this.userData.address
        ].filter(Boolean).join(' | ');

        this.doc.text(contactInfo, this.margin, this.currentY, {
            width: this.userData.profileImagePath ? this.pageWidth - this.margin * 2 - 100 : this.pageWidth - this.margin * 2,
            align: 'left'
        });

        this.currentY += 15;

        // Professional Links
        if (this.userData.linkedinProfile || this.userData.portfolioGithub) {
            const links = [
                this.userData.linkedinProfile ? 'LinkedIn: ' + this.userData.linkedinProfile : '',
                this.userData.portfolioGithub ? 'Portfolio: ' + this.userData.portfolioGithub : ''
            ].filter(Boolean).join(' | ');

            this.doc.fillColor('#3498db')
                   .text(links, this.margin, this.currentY, {
                       width: this.userData.profileImagePath ? this.pageWidth - this.margin * 2 - 100 : this.pageWidth - this.margin * 2,
                       align: 'left'
                   });
            this.currentY += 15;
        }

        this.currentY += 20;
        this.addSectionDivider();
    }

    addPersonalInfo() {
        // Additional personal info if available
        const personalDetails = [];
        if (this.userData.gender) personalDetails.push(`Gender: ${this.userData.gender}`);
        if (this.userData.nationality) personalDetails.push(`Nationality: ${this.userData.nationality}`);
        if (this.userData.maritalStatus) personalDetails.push(`Marital Status: ${this.userData.maritalStatus}`);
        if (this.userData.dateOfBirth) {
            const birthDate = new Date(this.userData.dateOfBirth);
            const age = new Date().getFullYear() - birthDate.getFullYear();
            personalDetails.push(`Age: ${age}`);
        }

        if (personalDetails.length > 0) {
            this.doc.fontSize(9)
                   .font('Helvetica')
                   .fillColor('#7f8c8d')
                   .text(personalDetails.join(' | '), this.margin, this.currentY, {
                       align: 'left'
                   });
            this.currentY += 20;
        }
    }

    addCareerObjective() {
        if (!this.userData.careerObjective) return;

        this.addSectionTitle('CAREER OBJECTIVE');
        this.doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#2c3e50')
               .text(this.userData.careerObjective, this.margin, this.currentY, {
                   align: 'justify',
                   lineGap: 2
               });

        this.currentY += this.calculateTextHeight(this.userData.careerObjective) + 15;
    }

    addEducation() {
        const hasEducation = this.userData.bachelor_degree || this.userData.master_degree || 
                           this.userData.twelfth_board || this.userData.tenth_board;
        
        if (!hasEducation) return;

        this.addSectionTitle('EDUCATION');

        // Master's Degree (if available)
        if (this.userData.master_degree) {
            this.addEducationEntry(
                this.userData.master_degree,
                this.userData.master_college,
                this.userData.master_year,
                this.userData.master_cgpa,
                "Master's Degree"
            );
        }

        // Bachelor's Degree
        if (this.userData.bachelor_degree) {
            this.addEducationEntry(
                this.userData.bachelor_degree,
                this.userData.bachelor_college,
                this.userData.bachelor_year,
                this.userData.bachelor_cgpa,
                "Bachelor's Degree"
            );
        }

        // 12th Standard
        if (this.userData.twelfth_board) {
            this.addEducationEntry(
                `12th Standard - ${this.userData.twelfth_stream || 'General'}`,
                `${this.userData.twelfth_school || ''} (${this.userData.twelfth_board})`,
                this.userData.twelfth_year,
                this.userData.twelfth_percentage,
                "Higher Secondary"
            );
        }

        // 10th Standard
        if (this.userData.tenth_board) {
            this.addEducationEntry(
                '10th Standard',
                `${this.userData.tenth_school || ''} (${this.userData.tenth_board})`,
                this.userData.tenth_year,
                this.userData.tenth_percentage,
                "Secondary Education"
            );
        }

        // Additional Qualifications
        if (this.userData.additional_qualifications) {
            this.doc.fontSize(11)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Additional Qualifications:', this.margin, this.currentY);
            this.currentY += 12;

            this.doc.fontSize(10)
                   .font('Helvetica')
                   .fillColor('#2c3e50')
                   .text(this.userData.additional_qualifications, this.margin, this.currentY, {
                       align: 'justify',
                       lineGap: 2
                   });
            this.currentY += this.calculateTextHeight(this.userData.additional_qualifications) + 12;
        }

        this.currentY += 10;
    }

    addEducationEntry(degree, institution, year, grade, level) {
        if (degree) {
            this.doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text(degree, this.margin, this.currentY);
            this.currentY += 12;
        }

        if (institution) {
            this.doc.fontSize(10)
                   .font('Helvetica-Oblique')
                   .fillColor('#34495e')
                   .text(institution, this.margin, this.currentY);
            this.currentY += 10;
        }

        if (year || grade) {
            const details = [
                year && `Year: ${year}`,
                grade && `Grade: ${grade}`
            ].filter(Boolean).join(' | ');

            this.doc.fontSize(9)
                   .font('Helvetica')
                   .fillColor('#7f8c8d')
                   .text(details, this.margin, this.currentY);
            this.currentY += 12;
        }
        
        this.currentY += 8;
    }

    addSkills() {
        const hasTechnicalSkills = this.userData.technical_skills;
        const hasSoftSkills = this.userData.soft_skills;
        
        if (!hasTechnicalSkills && !hasSoftSkills) return;

        this.addSectionTitle('SKILLS');

        if (hasTechnicalSkills) {
            this.doc.fontSize(11)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Technical Skills:', this.margin, this.currentY);
            this.currentY += 12;

            this.doc.fontSize(10)
                   .font('Helvetica')
                   .fillColor('#2c3e50')
                   .text(this.userData.technical_skills, this.margin, this.currentY, {
                       align: 'justify',
                       lineGap: 2
                   });
            this.currentY += this.calculateTextHeight(this.userData.technical_skills) + 12;
        }

        if (hasSoftSkills) {
            this.doc.fontSize(11)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Soft Skills:', this.margin, this.currentY);
            this.currentY += 12;

            this.doc.fontSize(10)
                   .font('Helvetica')
                   .fillColor('#2c3e50')
                   .text(this.userData.soft_skills, this.margin, this.currentY, {
                       align: 'justify',
                       lineGap: 2
                   });
            this.currentY += this.calculateTextHeight(this.userData.soft_skills) + 15;
        }
    }

    addWorkExperience() {
        if (!this.userData.workExperience) return;

        this.addSectionTitle('WORK EXPERIENCE');
        this.doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#2c3e50')
               .text(this.userData.workExperience, this.margin, this.currentY, {
                   align: 'justify',
                   lineGap: 2
               });

        this.currentY += this.calculateTextHeight(this.userData.workExperience) + 15;
    }

    addProjects() {
        if (!this.userData.projects) return;

        this.addSectionTitle('PROJECTS');
        this.doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#2c3e50')
               .text(this.userData.projects, this.margin, this.currentY, {
                   align: 'justify',
                   lineGap: 2
               });

        this.currentY += this.calculateTextHeight(this.userData.projects) + 15;
    }

    addCertifications() {
        if (!this.userData.certifications) return;

        this.addSectionTitle('CERTIFICATIONS & TRAINING');
        this.doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#2c3e50')
               .text(this.userData.certifications, this.margin, this.currentY, {
                   align: 'justify',
                   lineGap: 2
               });

        this.currentY += this.calculateTextHeight(this.userData.certifications) + 15;
    }

    addAchievements() {
        if (!this.userData.achievements) return;

        this.addSectionTitle('ACHIEVEMENTS & AWARDS');
        this.doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#2c3e50')
               .text(this.userData.achievements, this.margin, this.currentY, {
                   align: 'justify',
                   lineGap: 2
               });

        this.currentY += this.calculateTextHeight(this.userData.achievements) + 15;
    }

    addLanguagesAndHobbies() {
        const hasLanguages = this.userData.languagesKnown;
        const hasHobbies = this.userData.hobbies;

        if (!hasLanguages && !hasHobbies) return;

        if (hasLanguages || hasHobbies) {
            this.addSectionTitle('ADDITIONAL INFORMATION');
            
            if (hasLanguages) {
                this.doc.fontSize(11)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Languages Known:', this.margin, this.currentY);
                this.currentY += 10;

                this.doc.fontSize(10)
                       .font('Helvetica')
                       .fillColor('#2c3e50')
                       .text(this.userData.languagesKnown, this.margin, this.currentY);
                this.currentY += 12;
            }

            if (hasHobbies) {
                this.doc.fontSize(11)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Hobbies & Interests:', this.margin, this.currentY);
                this.currentY += 10;

                this.doc.fontSize(10)
                       .font('Helvetica')
                       .fillColor('#2c3e50')
                       .text(this.userData.hobbies, this.margin, this.currentY);
                this.currentY += 15;
            }
        }
    }
    
    addReferences() {
        if (!this.userData.references) return;

        this.addSectionTitle('REFERENCES');
        this.doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#2c3e50')
               .text(this.userData.references, this.margin, this.currentY, {
                   align: 'justify',
                   lineGap: 2
               });

        this.currentY += this.calculateTextHeight(this.userData.references) + 15;
    }

    addSectionTitle(title) {
        // Check if we need a new page
        if (this.currentY > this.pageHeight - 100) {
            this.doc.addPage();
            this.currentY = this.margin;
        }

        this.doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor('#2c3e50')
               .text(title, this.margin, this.currentY);
        
        this.currentY += 15;
        
        // Add underline
        this.doc.moveTo(this.margin, this.currentY - 5)
               .lineTo(this.pageWidth - this.margin, this.currentY - 5)
               .strokeColor('#3498db')
               .lineWidth(1)
               .stroke();
        
        this.currentY += 10;
    }

    addSectionDivider() {
        this.doc.moveTo(this.margin, this.currentY)
               .lineTo(this.pageWidth - this.margin, this.currentY)
               .strokeColor('#bdc3c7')
               .lineWidth(0.5)
               .stroke();
        this.currentY += 10;
    }

    calculateTextHeight(text) {
        if (!text) return 0;
        const lineHeight = 12;
        const charsPerLine = 80;
        const lines = Math.ceil(text.length / charsPerLine);
        return lines * lineHeight;
    }
}

// ATS Calculator Class
class ATSCalculator {
    constructor() {
        this.technicalKeywords = {
            programming: ['python', 'java', 'javascript', 'c++', 'c#', 'php', 'ruby', 'go', 'swift', 'kotlin', 'scala', 'r', 'matlab', 'typescript', 'rust'],
            webDevelopment: ['html', 'css', 'react', 'angular', 'vue', 'node.js', 'express', 'django', 'flask', 'bootstrap', 'jquery', 'sass', 'webpack'],
            databases: ['sql', 'mysql', 'postgresql', 'mongodb', 'oracle', 'sqlite', 'redis', 'cassandra', 'firebase', 'dynamodb'],
            cloudPlatforms: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'gitlab', 'github', 'heroku'],
            dataScience: ['machine learning', 'deep learning', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'scikit-learn', 'tableau', 'power bi', 'matplotlib'],
            mobileDevelopment: ['android', 'ios', 'react native', 'flutter', 'xamarin', 'cordova', 'ionic', 'unity'],
            frameworks: ['spring', 'hibernate', 'laravel', 'codeigniter', 'rails', 'ember', 'backbone'],
            tools: ['git', 'jira', 'confluence', 'postman', 'figma', 'adobe', 'photoshop', 'illustrator']
        };
        
        this.softSkills = [
            'communication', 'leadership', 'teamwork', 'problem solving', 'analytical', 'creative',
            'adaptable', 'organized', 'detail-oriented', 'time management', 'project management',
            'critical thinking', 'interpersonal', 'presentation', 'negotiation', 'mentoring'
        ];
        
        this.industryKeywords = [
            'agile', 'scrum', 'devops', 'ci/cd', 'testing', 'debugging', 'optimization',
            'security', 'performance', 'scalability', 'microservices', 'architecture',
            'automation', 'integration', 'deployment', 'monitoring', 'analysis'
        ];
    }
    
    calculateKeywordScore(profileData) {
        const allText = this.extractAllText(profileData).toLowerCase();
        
        let totalKeywords = 0;
        let matchedKeywords = 0;
        const matchedTerms = new Set();
        
        Object.values(this.technicalKeywords).forEach(keywords => {
            keywords.forEach(keyword => {
                totalKeywords++;
                if (allText.includes(keyword.toLowerCase()) && !matchedTerms.has(keyword)) {
                    matchedKeywords++;
                    matchedTerms.add(keyword);
                }
            });
        });
        
        this.softSkills.forEach(skill => {
            totalKeywords++;
            if (allText.includes(skill.toLowerCase()) && !matchedTerms.has(skill)) {
                matchedKeywords++;
                matchedTerms.add(skill);
            }
        });
        
        this.industryKeywords.forEach(keyword => {
            totalKeywords++;
            if (allText.includes(keyword.toLowerCase()) && !matchedTerms.has(keyword)) {
                matchedKeywords++;
                matchedTerms.add(keyword);
            }
        });
        
        const score = totalKeywords > 0 ? (matchedKeywords / totalKeywords) * 100 : 35;
        return Math.max(35, Math.min(100, score));
    }
    
    calculateFormatScore(profileData) {
        let score = 0;
        
        // Contact information + profile image (45 points max)
        if (profileData.fullName && profileData.fullName.length > 1) score += 15;
        if (profileData.email && profileData.email.includes('@')) score += 15;
        if (profileData.phoneNumber) score += 10;
        if (profileData.profileImagePath) score += 5; // Bonus for profile image
        
        // Professional links (20 points max)
        if (profileData.linkedinProfile) score += 10;
        if (profileData.portfolioGithub) score += 10;
        
        // Education completeness (20 points max)
        if (profileData.bachelor_degree) score += 10;
        if (profileData.bachelor_college) score += 5;
        if (profileData.bachelor_year) score += 5;
        
        // Content quality (15 points max)
        if (profileData.careerObjective) {
            const objLength = profileData.careerObjective.length;
            if (objLength >= 50 && objLength <= 400) score += 10;
            else if (objLength > 0) score += 5;
        }
        
        if (profileData.technical_skills || profileData.soft_skills) {
            const allSkills = (profileData.technical_skills || '') + ' ' + (profileData.soft_skills || '');
            const skillsCount = allSkills.split(/[,\nâ€¢]/).filter(s => s.trim()).length;
            if (skillsCount >= 8) score += 5;
            else if (skillsCount >= 5) score += 3;
        }
        
        return Math.min(100, score);
    }
    
    calculateCompletenessScore(profileData) {
        let score = 0;
        
        // Essential fields (60 points)
        const essentialFields = {
            fullName: 10,
            email: 10,
            phoneNumber: 8,
            careerObjective: 12,
            bachelor_degree: 10,
            technical_skills: 10
        };
        
        Object.entries(essentialFields).forEach(([field, points]) => {
            if (profileData[field] && profileData[field].toString().trim()) {
                score += points;
            }
        });
        
        // Important fields (25 points)
        const importantFields = {
            workExperience: 8,
            projects: 7,
            bachelor_college: 5,
            bachelor_year: 5
        };
        
        Object.entries(importantFields).forEach(([field, points]) => {
            if (profileData[field] && profileData[field].toString().trim()) {
                score += points;
            }
        });
        
        // Optional fields (15 points)
        const optionalFields = {
            linkedinProfile: 3,
            portfolioGithub: 3,
            certifications: 3,
            achievements: 3,
            soft_skills: 3
        };
        
        Object.entries(optionalFields).forEach(([field, points]) => {
            if (profileData[field] && profileData[field].toString().trim()) {
                score += points;
            }
        });
        
        return Math.min(100, score);
    }
    
    extractAllText(profileData) {
        const textFields = [
            'careerObjective', 'technical_skills', 'soft_skills', 'workExperience', 'projects',
            'certifications', 'achievements', 'bachelor_degree', 'bachelor_college',
            'master_degree', 'master_college', 'additional_qualifications'
        ];
        
        return textFields
            .map(field => profileData[field] || '')
            .join(' ')
            .toLowerCase();
    }
    
    calculateATSScore(profileData) {
        try {
            const keywordsScore = this.calculateKeywordScore(profileData);
            const formatScore = this.calculateFormatScore(profileData);
            const completenessScore = this.calculateCompletenessScore(profileData);
            
            // Weighted average: keywords 35%, format 35%, completeness 30%
            const overallScore = (keywordsScore * 0.35) + (formatScore * 0.35) + (completenessScore * 0.30);
            
            return {
                score: Math.round(overallScore),
                keywordsMatch: Math.round(keywordsScore),
                formatQuality: Math.round(formatScore),
                completeness: Math.round(completenessScore),
                lastUpdated: new Date().toLocaleDateString()
            };
        } catch (error) {
            console.error('ATS calculation error:', error);
            return {
                score: 65,
                keywordsMatch: 60,
                formatQuality: 70,
                completeness: 65,
                lastUpdated: new Date().toLocaleDateString()
            };
        }
    }
}

// Helper functions
function initializeResumeStorage() {
    const workbook = readExcelFile();
    if (!workbook.Sheets['Resume_Storage']) {
        const resumeData = [
            ['Resume_ID', 'User_ID', 'Resume_Filename', 'Resume_Path', 'Generated_Date', 'File_Size', 'Status']
        ];
        const resumeWorksheet = XLSX.utils.aoa_to_sheet(resumeData);
        XLSX.utils.book_append_sheet(workbook, resumeWorksheet, 'Resume_Storage');
        writeExcelFile(workbook);
    }
}

function initializeATSScore(userId, profileData = null) {
    try {
        const workbook = readExcelFile();
        
        if (!workbook.Sheets['ATS_Scores']) {
            const atsData = [
                ['User_ID', 'ATS_Score', 'Keywords_Match', 'Format_Quality', 'Completeness', 'Last_Updated', 'Resume_Version']
            ];
            const atsWorksheet = XLSX.utils.aoa_to_sheet(atsData);
            XLSX.utils.book_append_sheet(workbook, atsWorksheet, 'ATS_Scores');
        }
        
        const atsWorksheet = workbook.Sheets['ATS_Scores'];
        const atsData = XLSX.utils.sheet_to_json(atsWorksheet, { header: 1 });
        
        let atsScores;
        if (profileData) {
            const calculator = new ATSCalculator();
            atsScores = calculator.calculateATSScore(profileData);
        } else {
            atsScores = {
                score: 45,
                keywordsMatch: 40,
                formatQuality: 50,
                completeness: 45,
                lastUpdated: new Date().toLocaleDateString()
            };
        }
        
        const userIndex = atsData.findIndex((row, index) => 
            index > 0 && row[0] === userId
        );
        
        if (userIndex !== -1) {
            atsData[userIndex][1] = atsScores.score;
            atsData[userIndex][2] = atsScores.keywordsMatch;
            atsData[userIndex][3] = atsScores.formatQuality;
            atsData[userIndex][4] = atsScores.completeness;
            atsData[userIndex][5] = atsScores.lastUpdated;
        } else {
            atsData.push([
                userId, 
                atsScores.score, 
                atsScores.keywordsMatch, 
                atsScores.formatQuality, 
                atsScores.completeness, 
                atsScores.lastUpdated, 
                1
            ]);
        }
        
        const newATSWorksheet = XLSX.utils.aoa_to_sheet(atsData);
        workbook.Sheets['ATS_Scores'] = newATSWorksheet;
        writeExcelFile(workbook);
        
        return atsScores;
    } catch (error) {
        console.error('ATS initialization error:', error);
        return null;
    }
}

function updateATSScore(userId, profileData) {
    try {
        const calculator = new ATSCalculator();
        const atsScores = calculator.calculateATSScore(profileData);
        
        const workbook = readExcelFile();
        const atsWorksheet = workbook.Sheets['ATS_Scores'];
        const atsData = XLSX.utils.sheet_to_json(atsWorksheet, { header: 1 });
        
        const userIndex = atsData.findIndex((row, index) => 
            index > 0 && row[0] === userId
        );
        
        if (userIndex !== -1) {
            atsData[userIndex][1] = atsScores.score;
            atsData[userIndex][2] = atsScores.keywordsMatch;
            atsData[userIndex][3] = atsScores.formatQuality;
            atsData[userIndex][4] = atsScores.completeness;
            atsData[userIndex][5] = atsScores.lastUpdated;
        } else {
            atsData.push([
                userId, 
                atsScores.score, 
                atsScores.keywordsMatch, 
                atsScores.formatQuality, 
                atsScores.completeness, 
                atsScores.lastUpdated, 
                1
            ]);
        }
        
        const newATSWorksheet = XLSX.utils.aoa_to_sheet(atsData);
        workbook.Sheets['ATS_Scores'] = newATSWorksheet;
        writeExcelFile(workbook);
        
        return atsScores;
    } catch (error) {
        console.error('ATS update error:', error);
        return null;
    }
}

function getATSScore(userId) {
    try {
        const workbook = readExcelFile();
        const atsWorksheet = workbook.Sheets['ATS_Scores'];
        if (!atsWorksheet) return null;
        
        const atsData = XLSX.utils.sheet_to_json(atsWorksheet, { header: 1 });
        const userATS = atsData.slice(1).find(row => row[0] === userId);
        
        if (!userATS) return null;
        
        return {
            score: userATS[1],
            keywordsMatch: userATS[2],
            formatQuality: userATS[3],
            completeness: userATS[4],
            lastUpdated: userATS[5]
        };
    } catch (error) {
        console.error('ATS fetch error:', error);
        return null;
    }
}

// Auto-generate resume when profile is updated
async function autoGenerateResume(userId) {
    try {
        console.log('Auto-generating resume for user:', userId);
        
        const workbook = readExcelFile();
        const worksheet = workbook.Sheets['User_Registration'];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const userRow = data.slice(1).find(row => row[0] === userId);
        
        if (!userRow) {
            console.error('User not found for auto-resume generation:', userId);
            return false;
        }
        
        // Map comprehensive user data with new schema including profile image
        // Update the userData mapping in autoGenerateResume function
        const userData = {
            fullName: userRow[2] || 'N/A',
            email: userRow[3] || '',
            phoneNumber: userRow[4] || '',
            gender: userRow[5] || '',
            dateOfBirth: userRow[6] || '',
            address: userRow[7] || '',
            linkedinProfile: userRow[8] || '',
            portfolioGithub: userRow[9] || '',
            nationality: userRow[10] || '',
            maritalStatus: userRow[11] || '',
            profileImagePath: userRow[12] || '', // Profile image for resume
            careerObjective: userRow[13] || '',
            
            // Education data
            tenth_board: userRow[14] || '',
            tenth_year: userRow[15] || '',
            tenth_percentage: userRow[16] || '',
            tenth_school: userRow[17] || '',
            twelfth_board: userRow[18] || '',
            twelfth_year: userRow[19] || '',
            twelfth_percentage: userRow[20] || '',
            twelfth_school: userRow[21] || '',
            twelfth_stream: userRow[22] || '',
            bachelor_degree: userRow[23] || '',
            bachelor_year: userRow[24] || '',
            bachelor_cgpa: userRow[25] || '',
            bachelor_college: userRow[26] || '',
            master_degree: userRow[27] || '',
            master_year: userRow[28] || '',
            master_cgpa: userRow[29] || '',
            master_college: userRow[30] || '',
            additional_qualifications: userRow[31] || '',
            
            // Skills and experience
            technical_skills: userRow[32] || '',
            soft_skills: userRow[33] || '',
            workExperience: userRow[34] || '',
            projects: userRow[35] || '',
            certifications: userRow[36] || '',
            achievements: userRow[37] || '',
            languagesKnown: userRow[38] || '',
            hobbies: userRow[39] || '',
            references: userRow[40] || ''
        };
        
        console.log('Generating resume for:', userData.fullName);
        
        const generator = new ResumeGenerator(userData);
        const resumeInfo = await generator.generate();
        
        const resumeId = storeResumeInfo(userId, resumeInfo.filename, resumeInfo.filepath, resumeInfo.filesize);
        
        console.log('Resume generated successfully:', resumeInfo.filename);
        return !!resumeId;
        
    } catch (error) {
        console.error('Auto resume generation error:', error);
        return false;
    }
}

function storeResumeInfo(userId, filename, filepath, filesize) {
    try {
        const workbook = readExcelFile();
        initializeResumeStorage();
        
        const resumeWorksheet = workbook.Sheets['Resume_Storage'];
        const resumeData = XLSX.utils.sheet_to_json(resumeWorksheet, { header: 1 });
        
        // Remove any existing resume for this user
        const filteredData = resumeData.filter((row, index) => {
            return index === 0 || row[1] !== userId;
        });
        
        const newResumeRow = [
            filteredData.length,
            userId,
            filename,
            filepath,
            new Date().toISOString(),
            filesize,
            'ACTIVE'
        ];
        
        filteredData.push(newResumeRow);
        const newResumeWorksheet = XLSX.utils.aoa_to_sheet(filteredData);
        workbook.Sheets['Resume_Storage'] = newResumeWorksheet;
        writeExcelFile(workbook);
        
        return newResumeRow[0];
    } catch (error) {
        console.error('Resume storage error:', error);
        return null;
    }
}

function getResumeInfo(userId) {
    try {
        const workbook = readExcelFile();
        const resumeWorksheet = workbook.Sheets['Resume_Storage'];
        if (!resumeWorksheet) return null;
        
        const resumeData = XLSX.utils.sheet_to_json(resumeWorksheet, { header: 1 });
        const userResume = resumeData.slice(1).find(row => row[1] === userId && row[6] === 'ACTIVE');
        
        if (!userResume) return null;
        
        return {
            resumeId: userResume[0],
            filename: userResume[2],
            filepath: userResume[3],
            generatedDate: userResume[4],
            fileSize: userResume[5],
            status: userResume[6]
        };
    } catch (error) {
        console.error('Resume fetch error:', error);
        return null;
    }
}

// Image upload helper functions
function saveBase64Image(base64Data, userId) {
    try {
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 format');
        }

        const imageBuffer = Buffer.from(matches[2], 'base64');
        const extension = matches[1].split('/')[1];
        const filename = `profile-${userId}-${Date.now()}.${extension}`;
        const filepath = path.join(PROFILE_IMAGES_FOLDER, filename);

        fs.writeFileSync(filepath, imageBuffer);
        return filepath;
    } catch (error) {
        console.error('Error saving base64 image:', error);
        return null;
    }
}
// Python script integration function
async function generateResumeWithPython(userId, profileData, template) {
    return new Promise((resolve, reject) => {
        try {
            const outputPath = path.join(RESUMES_FOLDER, `Resume_${profileData.fullName.replace(/\s+/g, '_')}_${userId}_${Date.now()}.pdf`);
            
            // Prepare arguments for Python script
            const profileJSON = JSON.stringify(profileData);
            const args = [
                'python_scripts/resume_generator.py',  // Updated path
                profileJSON,
                outputPath,
                template
            ];
            
            console.log('Executing Python script with template:', template);
            
            // Spawn Python process
            const pythonProcess = spawn('python', args, {
                cwd: __dirname,  // This ensures we're running from the project root
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    try {
                        // Parse the result from Python script
                        const result = JSON.parse(stdout.trim());
                        resolve(result);
                    } catch (parseError) {
                        console.error('Python output parsing error:', parseError);
                        console.error('Python stdout:', stdout);
                        reject(new Error('Failed to parse Python script output'));
                    }
                } else {
                    console.error('Python script error:', stderr);
                    console.error('Python script exit code:', code);
                    reject(new Error(`Python script failed with code ${code}: ${stderr}`));
                }
            });
            
            pythonProcess.on('error', (error) => {
                console.error('Python process error:', error);
                reject(new Error(`Failed to execute Python script: ${error.message}`));
            });
            
        } catch (error) {
            reject(error);
        }
    });
}
function deleteProfileImage(imagePath) {
    try {
        if (imagePath && fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error deleting profile image:', error);
        return false;
    }
}

// Password reset functionality
function initializePasswordResets() {
    const workbook = readExcelFile();
    if (!workbook.Sheets['Password_Resets']) {
        const resetData = [
            ['Reset_ID', 'User_ID', 'Email', 'Reset_Token', 'Expiry_Date', 'Created_Date', 'Used', 'IP_Address']
        ];
        const resetWorksheet = XLSX.utils.aoa_to_sheet(resetData);
        XLSX.utils.book_append_sheet(workbook, resetWorksheet, 'Password_Resets');
        writeExcelFile(workbook);
    }
}

function generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
}

function createPasswordReset(userId, email, ipAddress) {
    try {
        const workbook = readExcelFile();
        initializePasswordResets();
        
        const resetWorksheet = workbook.Sheets['Password_Resets'];
        const resetData = XLSX.utils.sheet_to_json(resetWorksheet, { header: 1 });
        
        const resetToken = generateResetToken();
        const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const createdDate = new Date();
        
        const newResetRow = [
            resetData.length,
            userId,
            email,
            resetToken,
            expiryDate.toISOString(),
            createdDate.toISOString(),
            false,
            ipAddress
        ];
        
        resetData.push(newResetRow);
        const newResetWorksheet = XLSX.utils.aoa_to_sheet(resetData);
        workbook.Sheets['Password_Resets'] = newResetWorksheet;
        writeExcelFile(workbook);
        
        return resetToken;
    } catch (error) {
        console.error('Password reset creation error:', error);
        return null;
    }
}

function validateResetToken(token) {
    try {
        const workbook = readExcelFile();
        const resetWorksheet = workbook.Sheets['Password_Resets'];
        if (!resetWorksheet) return null;
        
        const resetData = XLSX.utils.sheet_to_json(resetWorksheet, { header: 1 });
        const resetRow = resetData.slice(1).find(row => 
            row[3] === token &&
            !row[6] &&
            new Date(row[4]) > new Date()
        );
        
        if (!resetRow) return null;
        
        return {
            resetId: resetRow[0],
            userId: resetRow[1],
            email: resetRow[2]
        };
    } catch (error) {
        console.error('Token validation error:', error);
        return null;
    }
}

function markTokenAsUsed(resetId) {
    try {
        const workbook = readExcelFile();
        const resetWorksheet = workbook.Sheets['Password_Resets'];
        const resetData = XLSX.utils.sheet_to_json(resetWorksheet, { header: 1 });
        
        const resetIndex = resetData.findIndex((row, index) => 
            index > 0 && row[0] === resetId
        );
        
        if (resetIndex !== -1) {
            resetData[resetIndex][6] = true;
            const newResetWorksheet = XLSX.utils.aoa_to_sheet(resetData);
            workbook.Sheets['Password_Resets'] = newResetWorksheet;
            writeExcelFile(workbook);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Token marking error:', error);
        return false;
    }
}

function updateUserPassword(userId, newPassword) {
    try {
        // Validate new password strength before updating
        if (!validatePasswordStrength(newPassword)) {
            throw new Error('New password does not meet strength requirements');
        }
        
        const workbook = readExcelFile();
        const worksheet = workbook.Sheets['User_Registration'];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const userIndex = data.findIndex((row, index) => 
            index > 0 && row[0] === userId
        );
        
        if (userIndex !== -1) {
            data[userIndex][42] = newPassword; // Password is at index 42
            const newWorksheet = XLSX.utils.aoa_to_sheet(data);
            workbook.Sheets['User_Registration'] = newWorksheet;
            writeExcelFile(workbook);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Password update error:', error);
        return false;
    }
}

function logLoginActivity(userId, ipAddress) {
    try {
        const workbook = readExcelFile();
        if (!workbook.Sheets['Login_Activity']) {
            const loginData = [
                ['Login_ID', 'User_ID', 'Login_Date', 'IP_Address', 'Status']
            ];
            const loginWorksheet = XLSX.utils.aoa_to_sheet(loginData);
            XLSX.utils.book_append_sheet(workbook, loginWorksheet, 'Login_Activity');
        }
        
        const loginWorksheet = workbook.Sheets['Login_Activity'];
        const loginData = XLSX.utils.sheet_to_json(loginWorksheet, { header: 1 });
        
        const newLoginRow = [
            loginData.length, userId, new Date().toLocaleString(), ipAddress, 'SUCCESS'
        ];
        
        loginData.push(newLoginRow);
        const newLoginWorksheet = XLSX.utils.aoa_to_sheet(loginData);
        workbook.Sheets['Login_Activity'] = newLoginWorksheet;
        writeExcelFile(workbook);
        
    } catch (error) {
        console.error('Login activity logging error:', error);
    }
}

// API Endpoints

// Profile image upload endpoint
app.post('/api/upload-profile-image', upload.single('profileImage'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        const imagePath = req.file.path;
        const imageUrl = `/profile_images/${req.file.filename}`;

        res.json({
            success: true,
            message: 'Profile image uploaded successfully',
            imagePath: imagePath,
            imageUrl: imageUrl,
            filename: req.file.filename
        });

    } catch (error) {
        console.error('Profile image upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload profile image: ' + error.message
        });
    }
});

// Base64 image upload endpoint
app.post('/api/upload-profile-image-base64', (req, res) => {
    try {
        const { imageData, userId } = req.body;

        if (!imageData || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Image data and user ID are required'
            });
        }

        const imagePath = saveBase64Image(imageData, userId);

        if (!imagePath) {
            return res.status(500).json({
                success: false,
                message: 'Failed to save profile image'
            });
        }

        const filename = path.basename(imagePath);
        const imageUrl = `/profile_images/${filename}`;

        res.json({
            success: true,
            message: 'Profile image uploaded successfully',
            imagePath: imagePath,
            imageUrl: imageUrl,
            filename: filename
        });

    } catch (error) {
        console.error('Base64 image upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload profile image: ' + error.message
        });
    }
});

// Serve profile images
app.use('/profile_images', express.static(PROFILE_IMAGES_FOLDER));

// Enhanced registration endpoint with image support and strong validation
app.post('/api/register', async (req, res) => {
    try {
        console.log('Registration request received:', req.body.username);
        
        const registrationData = req.body;
        
        // Enhanced server-side validation
        const validationErrors = validateRegistrationData(registrationData);
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: validationErrors.join('. ')
            });
        }
        
        const workbook = readExcelFile();
        const worksheet = workbook.Sheets['User_Registration'];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const existingUser = data.slice(1).find(row => 
            (row[41] && row[41].toString().toLowerCase() === registrationData.username.toLowerCase()) || 
            (row[3] && row[3].toString().toLowerCase() === registrationData.email.toLowerCase())
        );
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username or email already exists' 
            });
        }
        
        const newUserId = data.length;
        const registrationDate = new Date().toLocaleDateString();
        
        // Handle profile image if provided
        let profileImagePath = '';
        if (registrationData.profileImage) {
            profileImagePath = saveBase64Image(registrationData.profileImage, newUserId);
        }
        
        const newUserRow = [
            newUserId, 
            registrationDate, 
            registrationData.fullName, 
            registrationData.email, 
            registrationData.phoneNumber || '', 
            registrationData.gender || '',
            registrationData.dateOfBirth || '',
            registrationData.address || '',
            registrationData.linkedinProfile || '', 
            registrationData.portfolioGithub || '',
            registrationData.nationality || '',
            registrationData.maritalStatus || '',
            profileImagePath || '', // Profile image path
            registrationData.careerObjective || '',
            
            // Education
            registrationData.tenth_board || '',
            registrationData.tenth_year || '',
            registrationData.tenth_percentage || '',
            registrationData.tenth_school || '',
            registrationData.twelfth_board || '',
            registrationData.twelfth_year || '',
            registrationData.twelfth_percentage || '',
            registrationData.twelfth_school || '',
            registrationData.twelfth_stream || '',
            registrationData.bachelor_degree || '',
            registrationData.bachelor_year || '',
            registrationData.bachelor_cgpa || '',
            registrationData.bachelor_college || '',
            registrationData.master_degree || '',
            registrationData.master_year || '',
            registrationData.master_cgpa || '',
            registrationData.master_college || '',
            registrationData.additional_qualifications || '',
            
            // Skills and experience
            registrationData.technical_skills || '',
            registrationData.soft_skills || '',
            registrationData.workExperience || '',
            registrationData.projects || '',
            registrationData.certifications || '',
            registrationData.achievements || '',
            registrationData.languagesKnown || '',
            registrationData.hobbies || '',
            registrationData.references || '',
            
            // Account
            registrationData.username,
            registrationData.password // Password already validated for strength
        ];
        
        data.push(newUserRow);
        const newWorksheet = XLSX.utils.aoa_to_sheet(data);
        workbook.Sheets['User_Registration'] = newWorksheet;
        writeExcelFile(workbook);
        
        // Calculate ATS score with profile data including image
        const profileData = {
            ...registrationData,
            profileImagePath: profileImagePath
        };
        initializeATSScore(newUserId, profileData);
        
        // Auto-generate resume
        console.log('Auto-generating resume for new user:', newUserId);
        await autoGenerateResume(newUserId);
        
        console.log('User registered successfully:', registrationData.username);
        res.json({ 
            success: true, 
            message: 'Registration successful. Your resume has been automatically generated!',
            userId: newUserId 
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed: ' + error.message 
        });
    }
});

// Enhanced login endpoint
app.post('/api/login', async (req, res) => {
    try {
        console.log('Login request received:', req.body.username);
        
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username and password are required' 
            });
        }
        
        const workbook = readExcelFile();
        const worksheet = workbook.Sheets['User_Registration'];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const userRow = data.slice(1).find(row => {
            const dbUsername = row[41] ? row[41].toString().toLowerCase().trim() : '';
            const dbEmail = row[3] ? row[3].toString().toLowerCase().trim() : '';
            const searchUsername = username.toLowerCase().trim();
            return dbUsername === searchUsername || dbEmail === searchUsername;
        });

        if (!userRow) {
            console.log('User not found:', username);
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid username or password' 
            });
        }
        
        const storedPassword = userRow[42] ? userRow[42].toString().trim() : '';
        const inputPassword = password.toString().trim();
        
        console.log('Password comparison:');
        console.log('  - Stored password:', `"${storedPassword}"`);
        console.log('  - Input password:', `"${inputPassword}"`);
        console.log('  - Passwords match:', storedPassword === inputPassword);
        
        const isValidPassword = storedPassword === inputPassword;
        
        if (!isValidPassword) {
            console.log('Invalid password for user:', username);
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid username or password' 
            });
        }
        
        // Generate profile image URL if available
        let profileImageUrl = null;
        if (userRow[12]) { // Profile image path
            const filename = path.basename(userRow[12]);
            profileImageUrl = `/profile_images/${filename}`;
        }
        
        const userData = {
            userId: userRow[0],
            fullName: userRow[2],
            email: userRow[3],
            phoneNumber: userRow[4],
            address: userRow[7],
            linkedinProfile: userRow[8],
            portfolioGithub: userRow[9],
            profileImageUrl: profileImageUrl,
            registrationDate: userRow[1]
        };
        
        console.log('Login successful for user:', username);
        res.json({ 
            success: true, 
            message: 'Login successful',
            user: userData 
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Login failed: ' + error.message 
        });
    }
});

// Enhanced profile endpoint with image support
app.get('/api/profile/:userId', (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        console.log('Profile request for user:', userId);
        
        const workbook = readExcelFile();
        const worksheet = workbook.Sheets['User_Registration'];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const userRow = data.slice(1).find(row => row[0] === userId);
        
        if (!userRow) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const atsData = getATSScore(userId);
        const resumeData = getResumeInfo(userId);
        
        // Generate profile image URL if available
        let profileImageUrl = null;
        if (userRow[12]) { // Profile image path
            const filename = path.basename(userRow[12]);
            profileImageUrl = `/profile_images/${filename}`;
        }
        
        const profileData = {
            userId: userRow[0],
            registrationDate: userRow[1],
            fullName: userRow[2],
            email: userRow[3],
            phoneNumber: userRow[4],
            gender: userRow[5],
            dateOfBirth: userRow[6],
            address: userRow[7],
            linkedinProfile: userRow[8],
            portfolioGithub: userRow[9],
            nationality: userRow[10],
            maritalStatus: userRow[11],
            profileImagePath: userRow[12],
            profileImageUrl: profileImageUrl,
            careerObjective: userRow[13],
            
            // Education
            tenth_board: userRow[14],
            tenth_year: userRow[15],
            tenth_percentage: userRow[16],
            tenth_school: userRow[17],
            twelfth_board: userRow[18],
            twelfth_year: userRow[19],
            twelfth_percentage: userRow[20],
            twelfth_school: userRow[21],
            twelfth_stream: userRow[22],
            bachelor_degree: userRow[23],
            bachelor_year: userRow[24],
            bachelor_cgpa: userRow[25],
            bachelor_college: userRow[26],
            master_degree: userRow[27],
            master_year: userRow[28],
            master_cgpa: userRow[29],
            master_college: userRow[30],
            additional_qualifications: userRow[31],
            
            // Skills and experience
            technical_skills: userRow[32],
            soft_skills: userRow[33],
            workExperience: userRow[34],
            projects: userRow[35],
            certifications: userRow[36],
            achievements: userRow[37],
            languagesKnown: userRow[38],
            hobbies: userRow[39],
            references: userRow[40],
            username: userRow[41],
            atsScore: atsData,
            resumeInfo: resumeData
        };
        
        res.json({ 
            success: true, 
            profile: profileData 
        });
        
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch profile: ' + error.message 
        });
    }
});

// Enhanced update profile endpoint with image support and validation
app.put('/api/profile/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        console.log('Profile update request for user:', userId);
        
        const updateData = req.body;
        
        // Basic validation for profile updates
        if (!updateData.fullName || updateData.fullName.trim().length < 2) {
            return res.status(400).json({ 
                success: false, 
                message: 'Full name must be at least 2 characters long' 
            });
        }
        
        if (!updateData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updateData.email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide a valid email address' 
            });
        }
        
        const workbook = readExcelFile();
        const worksheet = workbook.Sheets['User_Registration'];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const userIndex = data.findIndex((row, index) => 
            index > 0 && row[0] === userId
        );
        
        if (userIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const existingEmailUser = data.slice(1).find((row, index) => 
            row[3] && row[3].toString().toLowerCase() === updateData.email.toLowerCase() && 
            row[0] !== userId
        );
        
        if (existingEmailUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already exists for another user' 
            });
        }
        
        // Handle profile image update
        let profileImagePath = data[userIndex][12]; // Keep existing image path
        if (updateData.profileImage && updateData.profileImage !== 'keep_existing') {
            // Delete old image if exists
            if (profileImagePath) {
                deleteProfileImage(profileImagePath);
            }
            // Save new image
            profileImagePath = saveBase64Image(updateData.profileImage, userId);
        }
        
        // Update all profile fields
        data[userIndex][2] = updateData.fullName;
        data[userIndex][3] = updateData.email;
        data[userIndex][4] = updateData.phoneNumber || '';
        data[userIndex][5] = updateData.gender || '';
        data[userIndex][6] = updateData.dateOfBirth || '';
        data[userIndex][7] = updateData.address || '';
        data[userIndex][8] = updateData.linkedinProfile || '';
        data[userIndex][9] = updateData.portfolioGithub || '';
        data[userIndex][10] = updateData.nationality || '';
        data[userIndex][11] = updateData.maritalStatus || '';
        data[userIndex][12] = profileImagePath || ''; // Update profile image path
        data[userIndex][13] = updateData.careerObjective || '';
        
        // Education updates
        data[userIndex][14] = updateData.tenth_board || '';
        data[userIndex][15] = updateData.tenth_year || '';
        data[userIndex][16] = updateData.tenth_percentage || '';
        data[userIndex][17] = updateData.tenth_school || '';
        data[userIndex][18] = updateData.twelfth_board || '';
        data[userIndex][19] = updateData.twelfth_year || '';
        data[userIndex][20] = updateData.twelfth_percentage || '';
        data[userIndex][21] = updateData.twelfth_school || '';
        data[userIndex][22] = updateData.twelfth_stream || '';
        data[userIndex][23] = updateData.bachelor_degree || '';
        data[userIndex][24] = updateData.bachelor_year || '';
        data[userIndex][25] = updateData.bachelor_cgpa || '';
        data[userIndex][26] = updateData.bachelor_college || '';
        data[userIndex][27] = updateData.master_degree || '';
        data[userIndex][28] = updateData.master_year || '';
        data[userIndex][29] = updateData.master_cgpa || '';
        data[userIndex][30] = updateData.master_college || '';
        data[userIndex][31] = updateData.additional_qualifications || '';
        
        // Skills and experience updates
        data[userIndex][32] = updateData.technical_skills || '';
        data[userIndex][33] = updateData.soft_skills || '';
        data[userIndex][34] = updateData.workExperience || '';
        data[userIndex][35] = updateData.projects || '';
        data[userIndex][36] = updateData.certifications || '';
        data[userIndex][37] = updateData.achievements || '';
        data[userIndex][38] = updateData.languagesKnown || '';
        data[userIndex][39] = updateData.hobbies || '';
        data[userIndex][40] = updateData.references || '';
        
        const newWorksheet = XLSX.utils.aoa_to_sheet(data);
        workbook.Sheets['User_Registration'] = newWorksheet;
        writeExcelFile(workbook);
        
        // Recalculate ATS score with updated profile data
        const updatedProfileData = {
            ...updateData,
            profileImagePath: profileImagePath
        };
        updateATSScore(userId, updatedProfileData);
        
        // Auto-generate new resume
        console.log('Auto-generating new resume after profile update for user:', userId);
        const resumeGenerated = await autoGenerateResume(userId);
        
        if (!resumeGenerated) {
            console.log('Warning: Resume regeneration failed for user:', userId);
        }
        
        console.log('Profile updated successfully for user:', userId);
        res.json({ 
            success: true, 
            message: 'Profile updated successfully. Your resume has been regenerated with the new information!' 
        });
        
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update profile: ' + error.message 
        });
    }
});

// Password reset endpoints with enhanced validation
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword, confirmPassword } = req.body;
        
        if (!token || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }
        
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match'
            });
        }
        
        // Enhanced password validation
        if (!validatePasswordStrength(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be 8-20 characters long and contain at least one letter, one number, and one symbol'
            });
        }
        
        const resetInfo = validateResetToken(token);
        
        if (!resetInfo) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }
        
        const passwordUpdated = updateUserPassword(resetInfo.userId, newPassword);
        
        if (!passwordUpdated) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update password'
            });
        }
        
        markTokenAsUsed(resetInfo.resetId);
        
        console.log(`Password reset successful for user ID: ${resetInfo.userId}`);
        
        res.json({
            success: true,
            message: 'Password has been reset successfully. You can now login with your new password.'
        });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password'
        });
    }
});

// Add these endpoints to your server.js file

const { spawn } = require('child_process');
const util = require('util');

// Generate resume with template selection and Python integration
app.post('/api/generate-resume/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const { template = 'professional' } = req.body;
        
        console.log(`Generating resume for user ${userId} with ${template} template`);
        
        const workbook = readExcelFile();
        const worksheet = workbook.Sheets['User_Registration'];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const userRow = data.slice(1).find(row => row[0] === userId);
        
        if (!userRow) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Create comprehensive profile data for Python script
        const profileData = {
            fullName: userRow[2] || '',
            email: userRow[3] || '',
            phoneNumber: userRow[4] || '',
            gender: userRow[5] || '',
            dateOfBirth: userRow[6] || '',
            address: userRow[7] || '',
            linkedinProfile: userRow[8] || '',
            portfolioGithub: userRow[9] || '',
            nationality: userRow[10] || '',
            maritalStatus: userRow[11] || '',
            profileImage: userRow[12] || '', // Profile image path for Python script
            careerObjective: userRow[13] || '',
            
            // Education
            tenth_board: userRow[14] || '',
            tenth_year: userRow[15] || '',
            tenth_percentage: userRow[16] || '',
            tenth_school: userRow[17] || '',
            twelfth_board: userRow[18] || '',
            twelfth_year: userRow[19] || '',
            twelfth_percentage: userRow[20] || '',
            twelfth_school: userRow[21] || '',
            twelfth_stream: userRow[22] || '',
            bachelor_degree: userRow[23] || '',
            bachelor_year: userRow[24] || '',
            bachelor_cgpa: userRow[25] || '',
            bachelor_college: userRow[26] || '',
            master_degree: userRow[27] || '',
            master_year: userRow[28] || '',
            master_cgpa: userRow[29] || '',
            master_college: userRow[30] || '',
            additional_qualifications: userRow[31] || '',
            
            // Skills and experience
            technical_skills: userRow[32] || '',
            soft_skills: userRow[33] || '',
            workExperience: userRow[34] || '',
            projects: userRow[35] || '',
            certifications: userRow[36] || '',
            achievements: userRow[37] || '',
            languagesKnown: userRow[38] || '',
            hobbies: userRow[39] || '',
            references: userRow[40] || ''
        };
        
        // Generate resume using Python script
        const resumeResult = await generateResumeWithPython(userId, profileData, template);
        
        if (resumeResult.success) {
            // Store resume information
            const resumeId = storeResumeInfo(userId, resumeResult.resume.filename, 
                path.join(RESUMES_FOLDER, resumeResult.resume.filename), resumeResult.resume.fileSize, template);
            
            res.json({
                success: true,
                message: `Resume generated successfully with ${template} template`,
                resume: {
                    ...resumeResult.resume,
                    template: template
                },
                atsScore: resumeResult.atsScore,
                enhancements: resumeResult.enhancements
            });
        } else {
            throw new Error(resumeResult.message);
        }
        
    } catch (error) {
        console.error('Resume generation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate resume: ' + error.message
        });
    }
});

// View resume endpoint
app.get('/api/view-resume/:userId', (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        console.log(`View resume request for user: ${userId}`);
        
        const resumeInfo = getResumeInfo(userId);
        
        if (!resumeInfo || !resumeInfo.filepath) {
            return res.status(404).json({
                success: false,
                message: 'Resume not found. Please generate a resume first.'
            });
        }
        
        // Check if file exists
        if (!fs.existsSync(resumeInfo.filepath)) {
            return res.status(404).json({
                success: false,
                message: 'Resume file not found. Please regenerate your resume.'
            });
        }
        
        // Set proper headers for PDF viewing
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${resumeInfo.filename}"`);
        
        // Stream the PDF file
        const fileStream = fs.createReadStream(resumeInfo.filepath);
        fileStream.pipe(res);
        
        fileStream.on('error', (error) => {
            console.error('File stream error:', error);
            res.status(500).json({
                success: false,
                message: 'Error reading resume file'
            });
        });
        
    } catch (error) {
        console.error('View resume error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to view resume: ' + error.message
        });
    }
});

// Download resume endpoint
app.get('/api/download-resume/:userId', (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        console.log(`Download resume request for user: ${userId}`);
        
        const resumeInfo = getResumeInfo(userId);
        
        if (!resumeInfo || !resumeInfo.filepath) {
            return res.status(404).json({
                success: false,
                message: 'Resume not found. Please generate a resume first.'
            });
        }
        
        // Check if file exists
        if (!fs.existsSync(resumeInfo.filepath)) {
            return res.status(404).json({
                success: false,
                message: 'Resume file not found. Please regenerate your resume.'
            });
        }
        
        // Set headers for download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${resumeInfo.filename}"`);
        res.setHeader('Content-Length', fs.statSync(resumeInfo.filepath).size);
        
        // Stream the file for download
        const fileStream = fs.createReadStream(resumeInfo.filepath);
        fileStream.pipe(res);
        
        fileStream.on('error', (error) => {
            console.error('Download stream error:', error);
            res.status(500).json({
                success: false,
                message: 'Error downloading resume file'
            });
        });
        
    } catch (error) {
        console.error('Download resume error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download resume: ' + error.message
        });
    }
});

// Refresh ATS Score endpoint
app.post('/api/refresh-ats/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        console.log(`Refreshing ATS score for user: ${userId}`);
        
        const workbook = readExcelFile();
        const worksheet = workbook.Sheets['User_Registration'];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const userRow = data.slice(1).find(row => row[0] === userId);
        
        if (!userRow) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Create profile data for ATS calculation
        const profileData = {
            fullName: userRow[2] || '',
            email: userRow[3] || '',
            phoneNumber: userRow[4] || '',
            careerObjective: userRow[13] || '',
            bachelor_degree: userRow[23] || '',
            bachelor_college: userRow[26] || '',
            master_degree: userRow[27] || '',
            technical_skills: userRow[32] || '',
            soft_skills: userRow[33] || '',
            workExperience: userRow[34] || '',
            projects: userRow[35] || '',
            certifications: userRow[36] || '',
            achievements: userRow[37] || '',
            linkedinProfile: userRow[8] || '',
            portfolioGithub: userRow[9] || ''
        };
        
        // Recalculate ATS score
        const updatedATSScore = updateATSScore(userId, profileData);
        
        if (updatedATSScore) {
            res.json({
                success: true,
                message: 'ATS score refreshed successfully',
                atsScore: updatedATSScore
            });
        } else {
            throw new Error('Failed to calculate ATS score');
        }
        
    } catch (error) {
        console.error('ATS refresh error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh ATS score: ' + error.message
        });
    }
});

// Update the storeResumeInfo function to include template
function storeResumeInfo(userId, filename, filepath, filesize, template = 'professional') {
    try {
        const workbook = readExcelFile();
        initializeResumeStorage();
        
        const resumeWorksheet = workbook.Sheets['Resume_Storage'];
        const resumeData = XLSX.utils.sheet_to_json(resumeWorksheet, { header: 1 });
        
        // Remove any existing resume for this user
        const filteredData = resumeData.filter((row, index) => {
            return index === 0 || row[1] !== userId;
        });
        
        const newResumeRow = [
            filteredData.length,
            userId,
            filename,
            filepath,
            new Date().toISOString(),
            filesize,
            'ACTIVE',
            template // Add template information
        ];
        
        filteredData.push(newResumeRow);
        const newResumeWorksheet = XLSX.utils.aoa_to_sheet(filteredData);
        workbook.Sheets['Resume_Storage'] = newResumeWorksheet;
        writeExcelFile(workbook);
        
        return newResumeRow[0];
    } catch (error) {
        console.error('Resume storage error:', error);
        return null;
    }
}

// Update the getResumeInfo function to include template
function getResumeInfo(userId) {
    try {
        const workbook = readExcelFile();
        const resumeWorksheet = workbook.Sheets['Resume_Storage'];
        if (!resumeWorksheet) return null;
        
        const resumeData = XLSX.utils.sheet_to_json(resumeWorksheet, { header: 1 });
        const userResume = resumeData.slice(1).find(row => row[1] === userId && row[6] === 'ACTIVE');
        
        if (!userResume) return null;
        
        return {
            resumeId: userResume[0],
            filename: userResume[2],
            filepath: userResume[3],
            generatedDate: userResume[4],
            fileSize: userResume[5],
            status: userResume[6],
            template: userResume[7] || 'professional'
        };
    } catch (error) {
        console.error('Resume fetch error:', error);
        return null;
    }
}
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`ELEVYA Server running on port ${PORT}`);
    console.log(`Visit: http://localhost:${PORT}`);
    initializeResumeStorage();
});