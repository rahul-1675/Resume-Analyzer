#!/usr/bin/env python3
"""
ELEVYA AI Profile Analyzer
Generates personalized improvement suggestions for ATS score optimization
"""

import json
import re
import sys
from datetime import datetime
from typing import Dict, List, Tuple, Any
from dataclasses import dataclass
from enum import Enum

class Priority(Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class Category(Enum):
    TECHNICAL_SKILLS = "technical_skills"
    EXPERIENCE = "experience"
    EDUCATION = "education"
    CERTIFICATIONS = "certifications"
    PROJECTS = "projects"
    ACHIEVEMENTS = "achievements"
    FORMAT = "format"
    KEYWORDS = "keywords"

@dataclass
class Suggestion:
    title: str
    description: str
    priority: Priority
    category: Category
    impact_score: int  # 1-10 scale
    actionable_steps: List[str]
    keywords_to_add: List[str] = None

class ProfileAnalyzer:
    def __init__(self):
        self.technical_keywords = {
            'programming_languages': [
                'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'php', 
                'ruby', 'go', 'swift', 'kotlin', 'scala', 'r', 'matlab', 'sql'
            ],
            'web_technologies': [
                'html', 'css', 'react', 'angular', 'vue', 'node.js', 'express', 
                'django', 'flask', 'spring', 'bootstrap', 'jquery', 'webpack'
            ],
            'databases': [
                'mysql', 'postgresql', 'mongodb', 'oracle', 'sqlite', 'redis', 
                'cassandra', 'dynamodb', 'elasticsearch'
            ],
            'cloud_platforms': [
                'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 
                'jenkins', 'gitlab', 'github', 'ci/cd'
            ],
            'data_science': [
                'machine learning', 'deep learning', 'tensorflow', 'pytorch', 
                'pandas', 'numpy', 'scikit-learn', 'tableau', 'power bi', 'spark'
            ],
            'mobile_development': [
                'android', 'ios', 'react native', 'flutter', 'xamarin', 
                'cordova', 'ionic'
            ]
        }
        
        self.soft_skills = [
            'leadership', 'communication', 'teamwork', 'problem solving',
            'analytical thinking', 'creativity', 'adaptability', 'time management',
            'project management', 'critical thinking', 'collaboration'
        ]
        
        self.industry_keywords = [
            'agile', 'scrum', 'devops', 'testing', 'debugging', 'optimization',
            'security', 'performance', 'scalability', 'microservices', 
            'architecture', 'api', 'rest', 'graphql'
        ]
        
        self.common_certifications = {
            'cloud': ['aws certified', 'azure certified', 'gcp certified'],
            'programming': ['oracle certified', 'microsoft certified', 'google certified'],
            'project_management': ['pmp', 'scrum master', 'agile certified'],
            'security': ['cissp', 'ceh', 'comptia security+'],
            'data': ['tableau certified', 'microsoft power bi', 'google analytics']
        }

    def analyze_profile(self, profile_data: Dict[str, Any]) -> List[Suggestion]:
        """
        Analyze user profile and generate improvement suggestions
        """
        suggestions = []
        
        # Analyze different aspects of the profile
        suggestions.extend(self._analyze_technical_skills(profile_data))
        suggestions.extend(self._analyze_experience(profile_data))
        suggestions.extend(self._analyze_education(profile_data))
        suggestions.extend(self._analyze_certifications(profile_data))
        suggestions.extend(self._analyze_projects(profile_data))
        suggestions.extend(self._analyze_achievements(profile_data))
        suggestions.extend(self._analyze_format_quality(profile_data))
        suggestions.extend(self._analyze_keywords(profile_data))
        
        # Sort by priority and impact score
        suggestions.sort(key=lambda x: (x.priority.value, -x.impact_score))
        
        return suggestions[:10]  # Return top 10 suggestions

    def _analyze_technical_skills(self, profile: Dict) -> List[Suggestion]:
        suggestions = []
        skills_text = (profile.get('skills', '') or '').lower()
        
        if not skills_text.strip():
            suggestions.append(Suggestion(
                title="Add Technical Skills Section",
                description="Your profile is missing technical skills. Add programming languages, frameworks, and tools you know.",
                priority=Priority.HIGH,
                category=Category.TECHNICAL_SKILLS,
                impact_score=9,
                actionable_steps=[
                    "List all programming languages you know",
                    "Include frameworks and libraries you've used",
                    "Add development tools and software",
                    "Mention database technologies",
                    "Include version control systems (Git, SVN)"
                ],
                keywords_to_add=['programming', 'development', 'coding']
            ))
            return suggestions

        # Count technical keywords present
        found_categories = 0
        missing_categories = []
        
        for category, keywords in self.technical_keywords.items():
            category_found = any(keyword in skills_text for keyword in keywords)
            if category_found:
                found_categories += 1
            else:
                missing_categories.append(category)

        # Suggest missing technical categories
        if len(missing_categories) > 2:
            suggestions.append(Suggestion(
                title="Expand Technical Skill Set",
                description=f"Your skills section covers {found_categories}/6 technical categories. Consider adding skills from missing areas.",
                priority=Priority.MEDIUM,
                category=Category.TECHNICAL_SKILLS,
                impact_score=7,
                actionable_steps=[
                    f"Add skills from: {', '.join(missing_categories[:3])}",
                    "Include both technical and soft skills",
                    "Use industry-standard terminology",
                    "Separate skills by categories"
                ],
                keywords_to_add=self._get_suggested_keywords(missing_categories[:2])
            ))

        # Check skill count
        skills_count = len([s.strip() for s in skills_text.split(',') if s.strip()])
        if skills_count < 8:
            suggestions.append(Suggestion(
                title="Increase Number of Listed Skills",
                description=f"You have {skills_count} skills listed. Aim for 8-15 relevant skills to improve ATS matching.",
                priority=Priority.MEDIUM,
                category=Category.TECHNICAL_SKILLS,
                impact_score=6,
                actionable_steps=[
                    "Add more specific technical skills",
                    "Include soft skills relevant to your field",
                    "Add tools and software you've used",
                    "Consider certifications as skills"
                ]
            ))

        return suggestions

    def _analyze_experience(self, profile: Dict) -> List[Suggestion]:
        suggestions = []
        experience = profile.get('workExperience', '') or ''
        
        if not experience.strip():
            suggestions.append(Suggestion(
                title="Add Work Experience Details",
                description="Work experience is crucial for ATS scoring. Include internships, part-time jobs, or volunteer work.",
                priority=Priority.HIGH,
                category=Category.EXPERIENCE,
                impact_score=10,
                actionable_steps=[
                    "Add any internships you've completed",
                    "Include part-time or freelance work",
                    "Mention volunteer positions with responsibilities",
                    "Add academic projects that simulate work experience",
                    "Use action verbs and quantify achievements"
                ]
            ))
        elif len(experience) < 200:
            suggestions.append(Suggestion(
                title="Expand Work Experience Descriptions",
                description="Your work experience section needs more detail. Add specific achievements and responsibilities.",
                priority=Priority.HIGH,
                category=Category.EXPERIENCE,
                impact_score=8,
                actionable_steps=[
                    "Add specific responsibilities for each role",
                    "Include quantifiable achievements (numbers, percentages)",
                    "Use strong action verbs (managed, developed, implemented)",
                    "Mention technologies and tools used",
                    "Highlight problem-solving examples"
                ]
            ))

        # Check for quantifiable achievements
        if not re.search(r'\d+%|\d+\+|\$\d+|\d+ (users|projects|team|months|years)', experience):
            suggestions.append(Suggestion(
                title="Add Quantifiable Achievements",
                description="Include numbers, percentages, and metrics to demonstrate your impact in previous roles.",
                priority=Priority.MEDIUM,
                category=Category.EXPERIENCE,
                impact_score=7,
                actionable_steps=[
                    "Add percentages for improvements you made",
                    "Include team sizes you worked with",
                    "Mention project timelines and budgets",
                    "Quantify user bases or customer numbers",
                    "Add performance metrics and KPIs"
                ]
            ))

        return suggestions

    def _analyze_education(self, profile: Dict) -> List[Suggestion]:
        suggestions = []
        degree = profile.get('degree', '') or ''
        institution = profile.get('institutionName', '') or ''
        year = profile.get('yearOfPassing', '') or ''
        grade = profile.get('percentageCGPA', '') or ''
        
        missing_fields = []
        if not degree: missing_fields.append('degree')
        if not institution: missing_fields.append('institution')
        if not year: missing_fields.append('graduation year')
        if not grade: missing_fields.append('GPA/percentage')
        
        if missing_fields:
            suggestions.append(Suggestion(
                title="Complete Education Information",
                description=f"Missing education details: {', '.join(missing_fields)}. Complete education section improves ATS scoring.",
                priority=Priority.MEDIUM,
                category=Category.EDUCATION,
                impact_score=6,
                actionable_steps=[
                    "Add your degree type and major",
                    "Include institution name and location",
                    "Add graduation year (or expected year)",
                    "Include GPA if above 3.0 or percentage if above 70%",
                    "Add relevant coursework if applicable"
                ]
            ))

        return suggestions

    def _analyze_certifications(self, profile: Dict) -> List[Suggestion]:
        suggestions = []
        certifications = (profile.get('certifications', '') or '').lower()
        
        if not certifications.strip():
            suggestions.append(Suggestion(
                title="Add Professional Certifications",
                description="Certifications significantly boost ATS scores. Consider getting relevant industry certifications.",
                priority=Priority.HIGH,
                category=Category.CERTIFICATIONS,
                impact_score=8,
                actionable_steps=[
                    "Research certifications relevant to your field",
                    "Start with free online certifications (Google, Microsoft, AWS)",
                    "Consider industry-standard certifications",
                    "Add online course completions (Coursera, edX, Udacity)",
                    "Include professional development workshops"
                ],
                keywords_to_add=['certified', 'certification', 'professional development']
            ))
        else:
            # Suggest additional certification categories
            cert_categories_found = 0
            for category, certs in self.common_certifications.items():
                if any(cert in certifications for cert in certs):
                    cert_categories_found += 1
            
            if cert_categories_found < 2:
                suggestions.append(Suggestion(
                    title="Diversify Your Certifications",
                    description="Consider adding certifications from different areas to broaden your profile appeal.",
                    priority=Priority.MEDIUM,
                    category=Category.CERTIFICATIONS,
                    impact_score=6,
                    actionable_steps=[
                        "Add cloud platform certifications (AWS, Azure, GCP)",
                        "Consider project management certifications",
                        "Get programming language specific certifications",
                        "Add cybersecurity certifications if relevant",
                        "Include data analysis certifications"
                    ]
                ))

        return suggestions

    def _analyze_projects(self, profile: Dict) -> List[Suggestion]:
        suggestions = []
        projects = profile.get('projects', '') or ''
        
        if not projects.strip():
            suggestions.append(Suggestion(
                title="Add Project Portfolio",
                description="Projects demonstrate practical skills and significantly improve ATS scores for technical roles.",
                priority=Priority.HIGH,
                category=Category.PROJECTS,
                impact_score=9,
                actionable_steps=[
                    "Add 2-3 significant projects you've completed",
                    "Include academic projects and personal projects",
                    "Describe technologies used and problems solved",
                    "Add GitHub links or project demonstrations",
                    "Mention team size and your specific contributions"
                ],
                keywords_to_add=['project', 'development', 'implementation']
            ))
        elif len(projects) < 150:
            suggestions.append(Suggestion(
                title="Expand Project Descriptions",
                description="Add more detail to your projects including technologies used, challenges faced, and outcomes achieved.",
                priority=Priority.MEDIUM,
                category=Category.PROJECTS,
                impact_score=7,
                actionable_steps=[
                    "Describe the problem each project solved",
                    "List specific technologies and tools used",
                    "Mention challenges overcome during development",
                    "Add measurable outcomes or results",
                    "Include links to live demos or repositories"
                ]
            ))

        return suggestions

    def _analyze_achievements(self, profile: Dict) -> List[Suggestion]:
        suggestions = []
        achievements = profile.get('achievements', '') or ''
        
        if not achievements.strip():
            suggestions.append(Suggestion(
                title="Highlight Your Achievements",
                description="Achievements show your excellence and can significantly differentiate your profile.",
                priority=Priority.MEDIUM,
                category=Category.ACHIEVEMENTS,
                impact_score=6,
                actionable_steps=[
                    "Add academic achievements (honors, dean's list)",
                    "Include competition wins or recognitions",
                    "Mention scholarship recipients",
                    "Add leadership positions held",
                    "Include volunteer work recognition"
                ]
            ))

        return suggestions

    def _analyze_format_quality(self, profile: Dict) -> List[Suggestion]:
        suggestions = []
        
        # Check contact information completeness
        missing_contact = []
        if not profile.get('phoneNumber'): missing_contact.append('phone number')
        if not profile.get('address'): missing_contact.append('address')
        if not profile.get('linkedinProfile'): missing_contact.append('LinkedIn profile')
        if not profile.get('portfolioGithub'): missing_contact.append('portfolio/GitHub')
        
        if len(missing_contact) >= 2:
            suggestions.append(Suggestion(
                title="Complete Contact Information",
                description=f"Missing: {', '.join(missing_contact)}. Complete contact info improves professional appearance.",
                priority=Priority.MEDIUM,
                category=Category.FORMAT,
                impact_score=5,
                actionable_steps=[
                    "Add professional phone number",
                    "Include city and state in address",
                    "Create and link professional LinkedIn profile",
                    "Add portfolio website or GitHub profile",
                    "Ensure all links are working and up-to-date"
                ]
            ))

        # Check career objective
        objective = profile.get('careerObjective', '') or ''
        if not objective.strip():
            suggestions.append(Suggestion(
                title="Add Career Objective Statement",
                description="A strong career objective helps ATS systems understand your career goals and improves keyword matching.",
                priority=Priority.MEDIUM,
                category=Category.FORMAT,
                impact_score=6,
                actionable_steps=[
                    "Write 2-3 sentences about your career goals",
                    "Include your target role and industry",
                    "Mention key skills you want to utilize",
                    "Keep it specific and relevant to job applications",
                    "Use industry keywords naturally"
                ]
            ))
        elif len(objective) < 50:
            suggestions.append(Suggestion(
                title="Expand Career Objective",
                description="Your career objective is too brief. Expand it to 100-200 characters for better ATS performance.",
                priority=Priority.LOW,
                category=Category.FORMAT,
                impact_score=4,
                actionable_steps=[
                    "Add more specific details about your goals",
                    "Include relevant industry keywords",
                    "Mention specific skills or technologies",
                    "Describe the value you can bring to employers"
                ]
            ))

        return suggestions

    def _analyze_keywords(self, profile: Dict) -> List[Suggestion]:
        suggestions = []
        
        # Combine all text fields for keyword analysis
        all_text = ' '.join([
            profile.get('careerObjective', '') or '',
            profile.get('skills', '') or '',
            profile.get('workExperience', '') or '',
            profile.get('projects', '') or '',
            profile.get('achievements', '') or ''
        ]).lower()
        
        if not all_text.strip():
            return suggestions
            
        # Count keyword categories present
        keyword_score = 0
        missing_keyword_types = []
        
        # Check technical keywords
        tech_found = sum(1 for keywords in self.technical_keywords.values() 
                        for keyword in keywords if keyword in all_text)
        if tech_found < 5:
            missing_keyword_types.append('technical keywords')
        else:
            keyword_score += 2
            
        # Check soft skills
        soft_found = sum(1 for skill in self.soft_skills if skill in all_text)
        if soft_found < 3:
            missing_keyword_types.append('soft skills')
        else:
            keyword_score += 1
            
        # Check industry keywords
        industry_found = sum(1 for keyword in self.industry_keywords if keyword in all_text)
        if industry_found < 3:
            missing_keyword_types.append('industry keywords')
        else:
            keyword_score += 1

        if keyword_score < 3:
            suggestions.append(Suggestion(
                title="Improve Keyword Density",
                description=f"Your profile lacks sufficient keywords. Missing: {', '.join(missing_keyword_types)}",
                priority=Priority.HIGH,
                category=Category.KEYWORDS,
                impact_score=8,
                actionable_steps=[
                    "Research job descriptions in your target role",
                    "Identify commonly used technical terms",
                    "Incorporate relevant industry buzzwords naturally",
                    "Add action verbs (managed, developed, implemented)",
                    "Use acronyms and full forms (AI, Artificial Intelligence)"
                ],
                keywords_to_add=self._get_high_impact_keywords()
            ))

        return suggestions

    def _get_suggested_keywords(self, categories: List[str]) -> List[str]:
        """Get suggested keywords for missing categories"""
        keywords = []
        for category in categories:
            if category in self.technical_keywords:
                keywords.extend(self.technical_keywords[category][:3])
        return keywords[:10]

    def _get_high_impact_keywords(self) -> List[str]:
        """Get high-impact keywords for general improvement"""
        return [
            'project management', 'team collaboration', 'problem solving',
            'agile', 'scrum', 'api', 'database', 'cloud', 'security'
        ]

def main():
    """
    Main function to process profile data and return suggestions
    """
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Profile data required as argument"}))
        return
    
    try:
        # Parse profile data from command line argument
        profile_data = json.loads(sys.argv[1])
        
        # Initialize analyzer and get suggestions
        analyzer = ProfileAnalyzer()
        suggestions = analyzer.analyze_profile(profile_data)
        
        # Convert suggestions to JSON-serializable format
        result = []
        for suggestion in suggestions:
            result.append({
                "title": suggestion.title,
                "description": suggestion.description,
                "priority": suggestion.priority.value,
                "category": suggestion.category.value,
                "impact_score": suggestion.impact_score,
                "actionable_steps": suggestion.actionable_steps,
                "keywords_to_add": suggestion.keywords_to_add or []
            })
        
        print(json.dumps({
            "success": True,
            "suggestions": result,
            "total_suggestions": len(result),
            "analysis_date": datetime.now().isoformat()
        }))
        
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON data provided"}))
    except Exception as e:
        print(json.dumps({"error": f"Analysis failed: {str(e)}"}))

if __name__ == "__main__":
    main()